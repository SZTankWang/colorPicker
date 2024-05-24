import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 3906 });

wss.on('connection', function connection(ws) {
    ws.on('error', console.error);

    ws.on('message', function message(data) {
        try {
            const received = JSON.parse(data)
            console.log('received:', received);
        }
        catch (e) {
            console.log('received error ',e)
        }
    });

    ws.send('server hello');
    testParam(ws)
    testAdd(ws)
    testRun(ws)
});

function testParam(ws) {
    console.log("server send paramFromApp")
    let cmd = {
        "cmd": "paramfromapp",
        "uuid": "com.ulanzi.ulanzideck.weather", //功能uuid
        "key": "0_1", //上位机按键key
        "param": {
            city: "长沙",
            temp: "cel",
            freq: "push",
            cityDisplay: "topRight",
            round: "no"
        }
    }
    ws.send(JSON.stringify(cmd))
}

function testAdd(ws) {
    console.log("server send add")
    let cmd = {
        "cmd": "add",
        "uuid": "com.ulanzi.ulanzideck.weather", //功能uuid
        "key": "0_1", //上位机按键key
        "param": {
            city: "上海",
            temp: "cel",
            freq: "push",
            cityDisplay: "topLeft",
            round: "no"
        }
    }
    ws.send(JSON.stringify(cmd))
}

function testRun(ws) {
    console.log("server send run")
    let cmd = {
        "cmd": "run",
        "uuid": "com.ulanzi.ulanzideck.weather",
        "key": "0_1",
        "param": {
            
        }
    }
    ws.send(JSON.stringify(cmd))
}