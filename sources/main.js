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
let actionParamMapping = new Map() ; //actionid -> param 
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
                const image = await run(data.param,actionid)
                await updateIcon(image,data.key)
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

}

function drawImageOnContext(imageUrl,context){
    return loadImage(imageUrl).then(img=>{
        context.drawImage(img,0,0,256,256,0,0,256,256)
    })
}

function drawImage(data, param) {
    let offScreenCanvas = createCanvas(256, 256);
    let context = offScreenCanvas.getContext("2d");
    //draw image 

    const __filename = fileURLToPath(import.meta.url);
    const __dir = dirname(__filename).split(sep)
    __dir.pop()
    const asset_dir = __dir.concat(["resources","actions","config"]).join(sep)
    console.log("asset_dir",asset_dir)
    let imagePromise = undefined;
        switch(data.weather){
        case "晴":
            imagePromise = drawImageOnContext(`${asset_dir}${sep}sun.jpeg`,context)
            break 
        case "多云":
            imagePromise = drawImageOnContext(`${asset_dir}${sep}cloud.jpg`,context)
            break 
        case "阴":
            imagePromise = drawImageOnContext(`${asset_dir}${sep}rain.jpeg`,context)
            break 
        default:
            imagePromise = drawImageOnContext(`${asset_dir}${sep}rain.jpeg`,context)
            
    }
    // context.fillStyle = '#038cfc'; //set fill color
    // context.fillRect(0, 0, 256, 256);
    return imagePromise.then(res=>{
        context.fillStyle = 'black'
        context.font = '30px serif'
        drawCityTitle(context, data, param.cityDisplay)
        context.font = '40px serif'
        context.fillText(`${getTemp(data, param.round, param.temp)} ° ${data.weather}`, 5, 80)
        context.font = '30px serif'
        context.fillText(`湿度`,5,140)
        context.fillText(data.humidity,150,140)
        context.fillText('风向',5,180)
        context.fillText(data.winddirection,150,180)
        context.fillText('风力',5,220)
        context.fillText(data.windpower,150,220)
        const image = offScreenCanvas.toDataURL("image/png")
        // console.log(image)
        return image; //return canvas element
    
    })
    // window.location.href=image; // it will save locally


}

//把插件功能配置到按键上
function add(key,actionid) {
    //当前正在通信的key，用来对应websocket
    currKey = key
    // 将刚刚建立连接的socket连接上
    keyWsMapping.set(currKey, latestWS)
    //记录与该件绑定的actionid
    keyActionMapping.set(currKey,actionid)
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

//摄氏华氏转换
function tempConverted(temp, farenheit) {
    return farenheit === "far" ? temp * 1.8 + 32 : temp
}

//获取温度
function getTemp(data, round, farenheit) {
    if (round === "yes") {
        return Math.ceil(tempConverted(data.temperature, farenheit))
    }
    return tempConverted(data.temperature, farenheit)
}

function drawCityTitle(context, data, position) {
    switch (position) {
        case "hide":
            break
        case "topLeft":
            context.fillText(data.city, 5, 30);
            break
        case "topRight":
            context.fillText(data.city, 160, 30);
            break
        case "bottomRight":
            context.fillText(data.city, 160, 225);
            break
        case "bottomLeft":
            context.fillText(data.city, 0, 225);
            break
    }
}

function getInterval(freq) {
    switch (freq) {
        case "ten":
            //test purpose
            return 10 * 60 * 1000
        case "thirty":
            return 30 * 60 * 1000
        case "hour":
            return 60 * 60 * 1000
    }
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
