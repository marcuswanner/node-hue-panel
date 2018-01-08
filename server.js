var express = require('express');
var app = express();
var http = require('http').Server(app);
var config = require('config');
var io = require('socket.io')(http);
var node_hue_api = require("node-hue-api");
var hue = node_hue_api.HueApi(config.get('hue.gateway'), config.get('hue.username'));
var lightState = node_hue_api.lightState;
var branding = config.get('branding');

function lightid(i) {
  return lights[i-1]['id'];
}

io.sockets.on('connection', function (socket) {
  console.log('user connected');
  triggerUpdate();

  socket.on('on', function (data) {
    state = lightState.create();
    if (data["state"]) {
      state.on();
    } else {
      state.off();
    }
    hue.setLightState(lightid(parseInt(data["index"])), state, function(err, result) {
      triggerUpdate();
      if (err) {
        console.log(err);
        socket.emit("hue-error", err);
      } else {
        console.log("hue " + (data["state"] ? "on " : "off ") + data["index"] + " successful");
        socket.emit("hue-success", {message: "successfully switched light " +
                    data["index"] + (data["state"] ? " on" : " off")});
      }
    });
  });
  socket.on('color', function (data) {
    state = lightState.create();
    state.on().hue(data["color"][0]).sat(data["color"][1]);
    hue.setLightState(lightid(parseInt(data["index"])), state, function(err, result) {
      triggerUpdate();
      if (err) {
        console.log(err);
        socket.emit("hue-error", err);
      } else {
        console.log("hue color " + data["index"] + "->h" + Math.round(data["color"][0]/256) + "s" +
                    Math.round(data["color"][1]) + " successful");
        socket.emit("hue-success", {message: "successfully changed color of light " + data["index"]});
      }
    });
  });
  socket.on('bri', function (data) {
    state = lightState.create();
    bri = Math.max(0, Math.min(255, data["bri"]));
    state.on().bri(bri);
    hue.setLightState(lightid(parseInt(data["index"])), state, function(err, result) {
      triggerUpdate();
      if (err) {
        console.log(err);
        socket.emit("hue-error", err);
      } else {
        console.log("hue bri " + data["index"] + "->" + bri + " successful");
        socket.emit("hue-success", {message: "successfully set brightness of light " +
                    data["index"] + " to " + bri});
      }
    });
  });


  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
});

app.set('view engine', 'ejs');

app.get('/', function(req, res) {
  res.render('lights', {lights:lights.length,branding:branding});
});

app.use('/images', express.static('images'));

var wait = setTimeout(update, 0);
var lights = [];

function triggerUpdate() {
  update();
}
function update() {
  if (wait != null) {
    clearTimeout(wait);
    wait = null;
  } else { //update already in progress
    return;
  }
  if (lights == 0) {
    hue.lights(function(err, result) {
      if (err) {
        console.log(err);
      } else {
        lights = result["lights"];
        console.log("gateway says we have "+lights.length+" lights");
      }
      wait = setTimeout(update, 0);
    });
    return;
  }
  if (io.engine.clientsCount == 0) {
    wait = -1;
    return;
  }
  if (lights.length > 0) {
    var i=1;
    var stats = [];
    var statusChain = function(err, result) {
      if (err) {
        console.log("getting state for light "+i+" failed: "+err);
        wait = setTimeout(update, 1000);
        return;
      }
      stats.push({
          on: result["state"]["on"],
          hue: result["state"]["hue"],
          sat: result["state"]["sat"],
          bri: result["state"]["bri"]
      });
      i++;
      if (i > lights.length) {
        io.emit("hue-lights", {"lights": stats});
        wait = setTimeout(update, 1000);
        return;
      }
      hue.lightStatus(lightid(i), statusChain);
    };
    hue.lightStatus(lightid(i), statusChain);
  }
}

http.listen(config.get("listen"));
