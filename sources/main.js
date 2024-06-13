import WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { createCanvas, loadImage, Image } from "canvas";
import { execFile } from 'node:child_process';
import  path from 'path';
import {fileURLToPath} from 'url';
import { ntc } from './ntc.js';
import clipboard from 'clipboardy';

// Weather Plugin Main JS Code 
//a websocket client & server that handle connection with 上位机 and action 

//读取上位机信息
const runtime = process.argv
const [ip, port] = runtime.slice(2, 4)
console.log(`ip and port are ${ip} ${port}`)
//client 
const ws = new WebSocket(`ws://${ip}:${port}`);

//server
let server = undefined;
try {

    server = new WebSocketServer({ port: 3961 })

}
catch (e) {
    console.log("释放端口")
}

// param
// {single:true/false, stockCode:string, rotateDuration:string, freq:string, bgColor:string,bgImg:string}
// rotateDuration: 多个股票切换的频率
// freq: 定时拉去新数据的频率
// TODO: 显示图片

let currKey = null; //记录当前正在通信的配置页
let currParam = null; //用来给当前配置页发送的配置
let keyWsMapping = new Map();//key -> ws 
let keyActionMapping = new Map(); //KEY -> ACTIONID
let actionKeyMapping = new Map(); //actionid -> key
let actionUUIDMapping = new Map(); //actionid -> uuid
let actionParamMapping = new Map(); //actionid -> param 
let actionTimerMapping = new Map() //actionid -> rotate-timer info {rotateTimer: int, rotateIdx: int,refreshTimer:int}
let latestWS = null; //最近建立连接的websocket
//绑定的按键
const uuid = "com.ulanzi.ulanzideck.colorPicker"
// const actionID = "com.ulanzi.ulanzideck.stock.config"
const updateFreq = 500


//更新定时器
let timer


const __filename = fileURLToPath(import.meta.url);

// 👇️ "/home/john/Desktop/javascript"
const __dirname = path.dirname(__filename);


//插件主程序 接受配置的消息
server.on('connection', function connection(ws) {
    //最近建立连接的ws，用来和页面通信
    latestWS = ws


    ws.on('error', console.error);

    ws.on('message', async function message(data) {
        console.log(`页面配置参数`, JSON.parse(data))
        let msg_ = JSON.parse(data)
        //向上位机更新参数
        updateParam(msg_)
        //运行一次
        switch(msg_.uuid){
            case "com.ulanzi.ulanzideck.colorPicker.picker":
                //设置定时
                if(msg_.pickType === "track"){
                    if(!actionTimerMapping.get(msg_.actionid)){
                        actionTimerMapping.set(msg_.actionid,1)
                    }
                    setTimeoutUpdate(()=>{
                        const image =  run(msg_.actionid)
                        // updateIcon(image, msg_.key, msg_.uuid)
                    },msg_.actionid)
                }
                if(msg_.pickType === "press"){
                    // console.log("清除跟踪",actionTimerMapping.get(msg_.actionid))
                    clearTimeout(actionTimerMapping.get(msg_.actionid))
                    actionTimerMapping.delete(msg_.actionid)
                    // run(msg_.actionid)
                }
                break 

            case "com.ulanzi.ulanzideck.colorPicker.palette":
                const image = runPalette(msg_.actionid)
                updateIcon(image,msg_.key,msg_.uuid)
            }
      
        // updateIcon(image, msg_.key, msg_.uuid)
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
ws.addEventListener("close", (event) => {
    server.close()
})

// Listen for messages
ws.addEventListener("message", async (event) => {
    try {
        // console.log("Message from server ", JSON.parse(event.data));
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
                    "actionid": actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
            
                switch(uuid){
                    case "com.ulanzi.ulanzideck.colorPicker.picker":
                        const image = await run(actionid,true)
                        break 
                    case "com.ulanzi.ulanzideck.colorPicker.palette":
                        runPalette(actionid,true)
                    
                }
                
                
                // updateIcon(image, key)
                //发送到上位机
                break

            case "setactive":
                if (data.active) {
                    add(key, actionid, uuid)
                    //如果之前有参数记录，则要发送这个执行结果
                    const prev_param = actionParamMapping.get(actionid)
                    if (prev_param !== undefined) {
                        console.log("存在持久化数据", prev_param)
                        switch(uuid){
                            case "com.ulanzi.ulanzideck.colorPicker.picker":
                                actionTimerMapping.set(actionid,1)
                                if(prev_param.pickType === "track"){
                                    setTimeoutUpdate(()=>{
                                        const image =  run(actionid)
                                        // updateIcon(image, key, uuid)
                
                                    },actionid)
                                }
                                else{
                                    const image = run(actionid)
                                    // updateIcon(image, key)
            
                                }
                                break 
                            
                            case "com.ulanzi.ulanzideck.colorPicker.palette":
                                const image = runPalette(actionid)
                                updateIcon(image,key,uuid)
                            }
                    }
                }
                else {
                    //清除所有定时器
                    if (actionTimerMapping.get(actionid)) {
                        clearTimeout(actionTimerMapping.get(actionid))
                        actionTimerMapping.delete(actionid)
                    }
                }


                resp = {
                    "code": 0,
                    "cmd": "setactive",
                    "active": data.active,
                    "uuid": uuid,
                    "key": data.key,
                    "actionid": actionid
                }
                ws.send(JSON.stringify(resp))
                break
            case 'paramfromapp':
                //设置从上位机发来的持久化参数
                paramfromapp(param, actionid, key,uuid)

                switch(uuid){
                    case "com.ulanzi.ulanzideck.colorPicker.picker":
                        // console.log("[add]建立追踪")
                        if(param.pickType === "track" && Object.keys(param).length > 0){
                            actionTimerMapping.set(actionid,1)
                            setTimeoutUpdate(()=>{
                                const image =  run(actionid)
                                // updateIcon(image, key, uuid)
        
                            },actionid)
                        }
                        break 
                }

                //回复
                resp = {
                    "cmd": "paramfromapp",
                    "uuid": uuid, //功能uuid
                    "key": key, //上位机按键key
                    "actionid": actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
                break

            case "add":

                //把插件某个功能配置到按键上
                add(key, actionid, uuid)
                // 持久化数据
                paramfromapp(param, actionid, key)

                switch(uuid){
                    case "com.ulanzi.ulanzideck.colorPicker.picker":
                        // console.log("[add]建立追踪")
                        if(param.pickType === "track" && Object.keys(param).length > 0){
                            actionTimerMapping.set(actionid,1)
                            setTimeoutUpdate(()=>{
                                run(actionid)
                                // updateIcon(image, key, uuid)
        
                            },actionid)
                        }
                        if(param.pickType === "press"){
                            //run(actionid)
                        }
                        break 
                    case "com.ulanzi.ulanzideck.colorPicker.palette":
                        if(param.value && param.value.indexOf("#")===0){
                            const image = runPalette(actionid)
                            updateIcon(image,key,uuid)
                        }
                }

                resp = {
                    "code": 0, // 0-"success" or ⾮0-"fail"
                    "cmd": "add",
                    "uuid": uuid, //功能uuid
                    "key": key, //上位机按键key
                    "actionid": actionid,
                    "param": {}
                }
                ws.send(JSON.stringify(resp))
                break
            case "init":
                break

            case "clearall":
                break

            case "clear":
                //清除配置信息，定时器
                let clearID = param[0].actionid
                if (actionTimerMapping.get(clearID)) {
                    const timer = actionTimerMapping.get(clearID)
                    console.log("待清除：", timer)
                    clearTimeout(timer)
                }
                actionKeyMapping.delete(clearID)
                actionUUIDMapping.delete(clearID)
                actionParamMapping.delete(clearID)
                resp = {
                    "code": 0, // 0-"success" or ⾮0-"fail"
                    "cmd": "clear",
                    "param": [
                        {
                            "uuid": param[0].uuid, //功能uuid
                            "key": param[0].key, //上位机按键key
                            "actionid": clearID//功能实例uuid
                        }]

                }
                break
            case "paramfromplugin":
                console.log("[paramfromplugin]", event.data)

        }

    }
    catch (e) {
        console.log("error parsing message", e)
    }

})

//执行插件功能
//param: 本次的配置，actionid:对应的实例
// fromPress:是否是按键
async function run(actionid, fromPress=false) {
    //make request 
    const param = actionParamMapping.get(actionid)
    console.log("[run] on param", param)
    //记录本次的param，用于下次setactive使用
    actionParamMapping.set(actionid, param)
    //唤起getColor.exe
    var exePath = path.join(__dirname, 'getColor.exe');

    const getColor = execFile(exePath,(error,stdout,stderr)=>{
        if(error){
            throw error
        }
        console.log("[getColor]",stdout)
        if(param){
            const image = drawImage(stdout,param,fromPress)
        //update icon
            updateIcon(image,actionKeyMapping.get(actionid),actionUUIDMapping.get(actionid))
        }

    })

}

function runPalette(actionid,fromPress=false){
    //生成图片
    const param = actionParamMapping.get(actionid)
    if(!param)return
    if(fromPress){
        clipboard.writeSync(param.value)
    } 
    if(param.paste){
        console.log("粘贴")
        clipboard.readSync()
    }
    let w = 256, h = 256
    let offScreenCanvas = createCanvas(w, h);
    let context = offScreenCanvas.getContext("2d");
    context.fillStyle = param.value
    context.fillRect(0,0,w,h)
    context.fillStyle = 'black'
    context.beginPath()
    context.roundRect(5,50,240,40,20)
    context.stroke()
    context.font = "40px serif";
    context.fillStyle = "black"
    context.fillText("Palette",70,80)    
    context.fillStyle = `#${invertHex(param.value.slice(1))}`
    context.font = "56px serif"
    context.fillText(param.value,35,150)
    const image = offScreenCanvas.toDataURL("image/png")
    return image

}

function setTimeoutUpdate(func, actionid){
    if(!actionTimerMapping.get(actionid)){
        return
    }
    clearTimeout(actionTimerMapping.get(actionid))
    let timer = setTimeout(()=>{
        console.log("定时跟踪")
        func()
        setTimeoutUpdate(func,actionid)
    },updateFreq)
    actionTimerMapping.set(actionid,timer)

}


function drawImage(data, param, fromPress=false) {
    const rgbData = data.split(" ")
    let w = 256, h = 256
    let offScreenCanvas = createCanvas(w, h);
    let context = offScreenCanvas.getContext("2d");
    context.fillStyle = `rgb(${data})`
    context.fillRect(0,0,w,h)
    const hex = rgbToHex(...data.split(" ").map(x=>parseInt(x)))
    console.log("hex ",hex)
    const name = ntc.name(`#${hex}`)[1]
    console.log(`hex ${hex}, name ${name}`)
    
    context.fillStyle = `#${invertHex(hex)}`
    let showText;
    switch(param.valueShow){
        case "name":
            showText = name
            context.font = "56px serif";
            if(name.split(" ").length > 1){
                let name_split = name.split(" ")
                if(name_split[0].length >= 8 || name_split[1].length >= 8){
                    context.font = "50px serif";
                }
                context.fillText(name_split[0], 30,120);
                context.fillText(name_split[1], 30,180);
            }

            else{
                if(name.length >= 8){
                    context.font = "50px serif";
                }
                context.fillText(name, 30,120);
            }
            break 
        case "rgb":
            showText = data
            context.font = "56px serif"
            context.fillText(`R:${rgbData[0]}`,20,60)
            context.fillText(`G:${rgbData[1]}`,20,140)
            context.fillText(`B:${rgbData[2]}`,20,220)
            
            break 
        case "hex":
            showText = `#${hex}`
            context.font = "56px serif"
            context.fillText(`${hex}`, 40,120)
            break 
    }
    if(fromPress && param.copy){
        clipboard.writeSync(showText)
    }
    
    

    const image = offScreenCanvas.toDataURL("image/png")
    return image

}

function invertHex(hex) {
    return (Number(`0x1${hex}`) ^ 0xFFFFFF).toString(16).substr(1).toUpperCase()
  }
  

function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }
  
  function rgbToHex(r, g, b) {
    const hexValue = componentToHex(r) + componentToHex(g) + componentToHex(b)
    return hexValue;
  }
  

//把插件功能配置到按键上
function add(key, actionid, uuid) {
    //当前正在通信的key，用来对应websocket
    currKey = key
    // 将刚刚建立连接的socket连接上
    keyWsMapping.set(currKey, latestWS)
    //记录与该件绑定的actionid
    keyActionMapping.set(currKey, actionid)
    actionUUIDMapping.set(actionid, uuid)
    actionKeyMapping.set(actionid, key)
}
//传递参数给插件
async function paramfromapp(param, actionid, key,uuid) {
    if (Object.entries(param).length == 0) {
        currParam = {}

    }
    else {
        //将会发送给配置页面
        currParam = param
        //如果初次数据就不为空，执行一次
        // const image = run(param, actionid)
        
    }
    //写入map中
    if (Object.entries(param).length != 0) {
        actionParamMapping.set(actionid, param)
    }

    //将对应的key和配置发送给配置页面
    let initialMsg = {
        "cmd": "paramfromplugin",
        "uuid": uuid, //功能uuid
        "param": currParam, //持久化的参数,
        "actionid": actionid,
        "key": key
    }

    if (keyWsMapping.get(key)) {
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
    const { key, actionid, uuid } = param
    //写入map
    actionParamMapping.set(param.actionid, param)
    //更新一次

    const msg = {
        "cmd": "paramfromplugin",
        "uuid": uuid, //功能uuid
        "key": key, //上位机按键key
        "param": param,
        "actionid": actionid
    }

    ws.send(JSON.stringify(msg))
}

//插件更新图标
async function updateIcon(data, key, uuid) {
    console.log(`updateIcon key ${key} actionid ${keyActionMapping.get(key)}`)
    const msg = {
        "cmd": "state",
        "param": {//图标状态更换，若⽆则为空
            "statelist": [
                {
                    "uuid": uuid, //功能uuid,
                    "actionid": keyActionMapping.get(key),
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
    if (exitCode || exitCode === 0) console.log("退出", exitCode);

    //shut down ws server
    if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, { exit: true }));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));
