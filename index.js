"use strict";

const Url = require('url');
const Listener = require('node-gpsd').Listener;
const mqtt = require('mqtt');

class Log {
  static state(...msg) { Log.log(0, ...msg); }
  static connect(...msg) { Log.log(90, ...msg); }
  static connect2(...msg) { Log.log(37, ...msg); }
  static watch(...msg) { Log.log(34, ...msg); }
  static data(...msg) { Log.log(0, ...msg); }

  static error(...msg) { Log.log(91, ...msg); }

  static log(color, ...msg) {
    console.log('\u001b[' + color + 'm', ...msg, '\u001b[0m');
  }
}

class State {
  static init(config) {
    State.makeMqtt(config);
    State.makeGpsd(config);
    State.state = 1;
  }

  // ------------------------------------------------------
  static upMqtt() {
    Log.state('Up mqtt');
    switch(State.state) {
    case 1: State.state = 2; break;
    case 3: State.state = 4; State.watch(); break;
    default: throw Error('unknown state');
    }
  }

  static downMqtt() {
    Log.state('Down mqtt');
    switch(State.state) {
    case 1: break;
    case 3: break;
    case 2: State.state = 1; break;
    case 4: State.state = 3; State.unwatch(true); break;
    default: throw Error('unknown state');
    }
  }

  static upGpsd() {
    Log.state('Up gpsd');
    switch(State.state) {
    case 1: State.state = 3; State.clear(); break;
    case 2: State.state = 4; State.clear(); State.watch(); break;
    default: throw Error('unknown state');
    }
  }

  static downGpsd() {
    Log.state('Down gpsd');
    switch(State.state) {
    case 1: break;
    case 2: break;
    case 3: State.state = 1; State.reconnect(); break;
    case 4: State.state = 2; State.reconnect(); State.unwatch(false); break;
    default: throw Error('unknown state');
    }
  }

  // ------------------------------------------------------
  static reconnect() {
    Log.connect('start gpsd timer');
    if(State.timer) { throw Error('exists already'); }
    State.timer = setInterval(() => {
      Log.connect('Reconnect gpsd');
      State.gpsd.connect();
    }, State.gpsdreconnectMSecs);
  }

  static clear() {
    if(!State.timer) { throw Error('clear nothing?'); }
    Log.connect('clear gpsd timer');
    clearInterval(State.timer);
    State.timer = undefined;
  }

  static watch() {
    Log.watch('Watch');
    State.gpsd.watch();
    State.gpsd.on('TPV', foo => { Log.data('TPV', foo); State.mqtt.publish('gpsd/tpv', JSON.stringify(foo)); });
    State.gpsd.on('INFO', foo => { Log.data('INFO', foo); });
    State.gpsd.on('DEVICE', foo => { Log.data('DEVICE', foo); });
    State.gpsd.on('DEVICES', foo => { Log.data('DEVICES', foo); State.mqtt.publish('gpsd/devices', JSON.stringify(foo)); });
    State.gpsd.on('SKY', foo => { Log.data('SKY', foo); State.mqtt.publish('gpsd/sky', JSON.stringify(foo)); });
  }

  static unwatch(real) {
    Log.watch('Unwatch');
    if(real) { 
      State.gpsd.unwatch();
    }
  }

  // ------------------------------------------------------
  static makeMqtt(config) {
    State.mqtt = mqtt.connect(config.mqtt.url, { reconnectPeriod: config.mqtt.reconnectMSecs });
    
    State.mqtt.on('connect', () => { State.upMqtt(); });
    State.mqtt.on('reconnect', () => { Log.connect('Reconnect mqtt'); });
    State.mqtt.on('close', () => { Log.connect('Disconnect mqtt'); });
    State.mqtt.on('offline', () => { State.downMqtt(); });
    State.mqtt.on('error', error => { Log.error(error); throw error; });
  }

  static makeGpsd(config) {
    State.gpsdreconnectMSecs = config.gpsd.reconnectMSecs;

    State.gpsd = new Listener({
      hostname: config.gpsd.hostname,
      port: config.gpsd.port,
      logger: {
        info: Log.connect2,
        warn: Log.connect2,
        error: Log.connect2
      }
    });

    State.gpsd.on('connected', () => { State.upGpsd(); });
    State.gpsd.on('disconnected', () => { State.downGpsd(); });
    State.gpsd.on('error', error => { Log.error('gpsd Error', error); });
    State.gpsd.on('error.connection', error => { }); // fall threw to disconnect
    State.gpsd.on('error.socket', error => {  }); // fall thew to disconnect
    
    State.gpsd.connect();
    State.reconnect();
  }
}


if(!module.parent) {
  if(!process.env.mqtturl) { Log.error('unspecified mqtt url'); process.exit(-1); }
  if(!process.env.gpsdurl) { Log.error('unspecified gpsd url'); process.exit(-1); }

  const url = Url.parse(process.env.gpsdurl);
  const hostname = url.hostname ? url.hostname : url.href;
  const port = url.port ? url.port : 2947;
  
  State.init({
    mqtt: { url: process.env.mqtturl, reconnectMSecs: 1000 * 11 },
    gpsd: { hostname: hostname, port: port, reconnectMSecs: 1000 * 13 }
  });
}



