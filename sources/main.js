import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { createCanvas,loadImage } from "canvas";
import { dirname,sep } from 'path';
import { fileURLToPath } from 'url';
import { stocks } from "stock-api";


// Weather Plugin Main JS Code 
//a websocket client & server that handle connection with 上位机 and action 

//读取上位机信息
const runtime = process.argv
const [ip,port] = runtime.slice(2,4)
console.log(`ip and port are ${ip} ${port}`)
//client 
const ws = new WebSocket(`ws://${ip}:${port}`);

//server
let server = undefined;
try{

     server = new WebSocketServer({ port: 3915 })

}
catch (e){
    console.log("释放端口")
}

// param
// {single:true/false, stockCode:string, rotateDuration:string, freq:string, bgColor:string,bgImg:string}
// rotateDuration: 多个股票切换的频率
// freq: 定时拉去新数据的频率
// TODO: 接受参数 -》 拉取数据 -> 定时更新展示图标

let currKey = null; //记录当前正在通信的配置页
let currParam = null; //用来给当前配置页发送的配置
let keyWsMapping = new Map();//key -> ws 
let keyActionMapping = new Map(); //KEY -> ACTIONID
let actionKeyMapping = new Map() ; //actionid -> key
let actionParamMapping = new Map() ; //actionid -> param 
let actionResultMapping = new Map(); //actionid -> stock result list
let actionTimerMapping = new Map() //actionid -> rotate-timer info {rotateTimer: int, rotateIdx: int,refreshTimer:int}
let latestWS = null; //最近建立连接的websocket
//绑定的按键
const uuid = "com.ulanzi.ulanzideck.stock"
const actionID = "com.ulanzi.ulanzideck.stock.config"

//更新定时器
let timer

//腾讯股票信息
const tencent = stocks.tencent;


//插件主程序 接受配置的消息
server.on('connection', function connection(ws) {
    //最近建立连接的ws，用来和页面通信
    latestWS = ws


    ws.on('error', console.error);

    ws.on('message', function message(data) {
        console.log(`页面配置参数`, JSON.parse(data))
        let msg_ = JSON.parse(data)
        //向上位机更新参数
        updateParam(msg_)
        switch (msg_.freq) {
            
            case "":
                break
            default:


        }
    });


});

let resp;


// Connection opened
ws.addEventListener("open", (event) => {
    //发送建立连接消息
    const hello = {
        "code": 0, // 0-"success" or ⾮0-"fail"
        "cmd": "connected", //连接命令
        "uuid": uuid //插件uuid。同配置⽂件UUID保持⼀致。⽤于区分插件
    }
    console.log(`sending ${hello}`)
    ws.send(JSON.stringify(hello))
});
//Connection closed 
ws.addEventListener("close",(event)=>{
    server.close()
})

// Listen for messages
ws.addEventListener("message", async (event) => {
    try {
        console.log("Message from server ", JSON.parse(event.data));
        const data = JSON.parse(event.data)
        const { cmd, uuid, key, param, actionid } = data
        switch (cmd) {
            case "connected":
                //建立连接
                resp = {
                    "code": 0, // 0-"success" or ⾮0-"fail"
                    "cmd": "connected", //连接命令
                    "uuid": uuid //插件uuid。同配置⽂件UUID保持⼀致。⽤于区分插件
                }
                ws.send(JSON.stringify(resp))
                break
            case "run":
                //回复
                resp = {
                    "code": 0, // 0-"success" or ⾮0-"fail"
                    "cmd": "run",
                    "uuid": uuid, //功能uuid
                    "key": key, //上位机按键key,
                    "actionid":actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
                const image = await run(param,actionid)
                await updateIcon(image,key)
                //发送到上位机
                break

            case "setactive":
                if(data.active){
                    add(key,actionid)
                    //如果之前有执行结果，则要发送这个执行结果
                    const prev_param = actionParamMapping.get(actionid)
                    if(prev_param!==undefined){

                    }
                }

                resp = {
                    "code":0,
                    "cmd":"setactive",
                    "active":data.active,
                    "uuid":uuid,
                    "key":data.key,
                    "actionid":actionid
                }
                ws.send(JSON.stringify(resp))
                break
            case 'paramfromapp':
                //设置从上位机发来的持久化参数
                paramfromapp(param, actionid,key)
                //回复
                resp = {
                    "cmd": "paramfromapp",
                    "uuid": uuid, //功能uuid
                    "key": key, //上位机按键key
                    "actionid":actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
                break

            case "add":

                //把插件某个功能配置到按键上
                add(key,actionid)
                // 持久化数据
                paramfromapp(data,actionid,data)

                resp = {
                    "code": 0, // 0-"success" or ⾮0-"fail"
                    "cmd": "add",
                    "uuid": uuid, //功能uuid
                    "key": key, //上位机按键key
                    "actionid":actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
                break
            case "init":
                break

            case "clearall":
                break

            case "clear":
                break
            case "paramfromplugin":
                console.log("[paramfromplugin]", event.data)

        }

    }
    catch (e) {
        console.log("error parsing message", e)
    }

});

//执行插件功能
//param: 本次的配置，actionid:对应的实例
//需要插件配置的股票代码
//run拉取一次新的数据
async function run(param,actionid) {
    //make request 
    console.log("invoking run")
    //记录本次的param，用于下次setactive使用
    actionParamMapping.set(actionid,param)
    //拉新的股票信息
    if(param.stockCode.includes("\n")){
        param.stockCode = param.stockCode.split("\n")
        if(param.stockCode[param.stockCode.length-1]==="") param.stockCode.pop()

    }
    let result = await getStockInfo(param.stockCode)
    console.log("查询结果",result)
    if(param.single){
        //如果之前该actionid有轮动以及刷新定时定时，清除掉
        if(actionTimerMapping.get(actionid)){
            clearInterval(actionTimerMapping.get(actionid).rotateTimer)
            clearInterval(actionTimerMapping.get(actionid).refreshTimer)
        }
        //
        const image  = drawImage(result,param)
        
        //如果设置了定时更新，则创建一个定时器，定时重新拉取数据，更新图标
        //更新图标
        let refreshTimer = setInterval(async()=>{
            console.log("重新拉取数据")
            //重新拉取数据
            let result = await getStockInfo(param.stockCode)
            //重新更新
            let image = drawImage(result,param)
            updateIcon(image,actionKeyMapping.get(actionid))

        },getInterval(param.freq))

        actionTimerMapping.set(actionid,{rotateTimer:undefined,rotateIdx:0,refreshTimer:refreshTimer})
        return image 
    }
    else{
        //按照设置的时间间隔，轮动股票信息
        actionResultMapping.set(actionid,result)
        if(actionTimerMapping.get(actionid)){
            clearInterval(actionTimerMapping.get(actionid).rotateTimer)
            clearInterval(actionTimerMapping.get(actionid).refreshTimer)
        }
        //画图并更新一次
        const image = drawImage(result[0],param)

        //设置新的轮动定时

        let timer = setInterval(()=>{
            //定时更新图标
            console.log(`定时轮动 ${param},${actionid}`)
            let rotateIdx = actionTimerMapping.get(actionid).rotateIdx
            const image = drawImage(actionResultMapping.get(actionid)[rotateIdx % (actionResultMapping.get(actionid)).length],param)
            updateIcon(image,actionKeyMapping.get(actionid))
            actionTimerMapping.get(actionid).rotateIdx += 1
        },getInterval(param.rotateDuration))
        actionTimerMapping.set(actionid,{rotateTimer:timer,rotateIdx:1})
        return image
    }


}

function getInterval(time){
    return parseInt(time) * 1000
}

async function getStockInfo(stockCode){
    if(typeof stockCode === "string"){
        return tencent.getStock(stockCode)
        .then(res=>{
            return res 
        })
        .catch(rej=>{
            return rej 
        })

    }
    else if(stockCode instanceof Array){
        console.log("股票列表",stockCode)
        return tencent.getStocks(stockCode)
        .then(res=>{
            return res
        })
        .catch(rej=>rej)
    }
}

function drawImageOnContext(imageUrl,context){
    return loadImage(imageUrl).then(img=>{
        context.drawImage(img,0,0,256,256,0,0,256,256)
    })
}

function drawImage(data, param) {
    let w = 256, h=256
    let offScreenCanvas = createCanvas(w, h);
    let context = offScreenCanvas.getContext("2d");
    //draw image 
    context.fillStyle = param.bgColor;
    context.fillRect(0,0,w,h)
    context.font='bold 32px serif'
    context.fillStyle ='#ffffff'
    context.fillText(data.name,60,40)
    context.fillText(data.now,10,100)
    let trend ;
    if(data.percent < 0){
        context.fillStyle = "#2fbe25"
        trend = "\u{02193}"
    }
    else{
        context.fillStyle = "#be3b25"
        trend = "\u{02191}"
    }
    context.fillText(`(${(data.percent*100).toFixed(2)}%)`,10,150)
    context.fillText(trend,128,200)
    const image = offScreenCanvas.toDataURL("image/png")
    return image 

}

//把插件功能配置到按键上
function add(key,actionid) {
    //当前正在通信的key，用来对应websocket
    currKey = key
    // 将刚刚建立连接的socket连接上
    keyWsMapping.set(currKey, latestWS)
    //记录与该件绑定的actionid
    keyActionMapping.set(currKey,actionid)
    actionKeyMapping.set(actionid,key)
}
//传递参数给插件
async function paramfromapp(param, actionid,key) {
    if (Object.entries(param).length == 0) {
        currParam = {}

    }
    else {
        //将会发送给配置页面
        currParam = param
        //如果初次数据就不为空，执行一次

    }
    //写入map中
    actionParamMapping.set(actionid,param)
    //将对应的key和配置发送给配置页面
    let initialMsg = {
        "cmd": "paramfromplugin",
        "uuid": "com.ulanzi.ulanzideck.weather", //功能uuid
        "param": currParam, //持久化的参数,
        "actionid":actionid,
        "key":key
    }

    if(keyWsMapping.get(key)){
        console.log("发送参数到页面")
        keyWsMapping.get(key).send(JSON.stringify(initialMsg))
    }

}

//插件状态初始化
function init() {

}
//清理插件的功能配置
function clearAll() {

}
//移除单个配置信息
function clear() {

}
// 插件->上位机
//插件更新参数
async function updateParam(param) {
    console.log("[updateParam]", param.key, param.actionid)
    const {key,actionid} = param 
    //写入map
    actionParamMapping.set(param.actionid,param)
    //更新一次

    const msg = {
        "cmd": "paramfromplugin",
        "uuid": actionID, //功能uuid
        "key": key, //上位机按键key
        "param": param,
        "actionid":actionid
    }

    ws.send(JSON.stringify(msg))
}

//插件更新图标
async function updateIcon(data,key) {
    console.log(`updateIcon key ${key} actionid ${keyActionMapping.get(key)}`)
    const msg = {
        "cmd": "state",
        "param": {//图标状态更换，若⽆则为空
            "statelist": [
                {
                    "uuid": actionID, //功能uuid,
                    "actionid":keyActionMapping.get(key),
                    "key": key,
                    "type": 1,
                    "state": 1, // 图标列表数组编号。请对照manifest.json
                    "data": data, // ⾃定义图标base64编码数据
                    "path": "" //本地图⽚⽂件
                }
            ]
        }
    }
    ws.send(JSON.stringify(msg))
}


//clean up 
function exitHandler(options, exitCode) {
    if (exitCode || exitCode === 0) console.log("退出",exitCode);

    //shut down ws server
    if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null,{exit:true}));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
