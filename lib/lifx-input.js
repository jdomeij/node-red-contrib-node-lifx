var lifxServer = require('./lifx-server.js');

module.exports = function(RED) {
  "use strict";
  var colorConvert = require('color-convert');
  var kelvinToRGB = require('kelvin-to-rgb');
  var rgbHex = require('rgb-hex');


  var defaultRGB = '#555555';
  var regexRGB = /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

  /**
   * Convert HSL value to RGB and update state object
   * @param  {object} state State object
   */
  function stateHSLToRGB(state) {
    var tmp;
    try {
      tmp = colorConvert.hsl.hex(state.hue, state.saturation, state.brightness);
    }
    catch(e) {
      tmp = '000000';
    }

    if (typeof tmp !== 'string')
      tmp = '#000000';
    state.rgb = '#000000'.slice(0, -tmp.length) + tmp
  }

  /**
   * Convert RGB value to HSL and update state object
   * @param  {object} state State object
   */
  function stateRGBToHSL(state) {
    var tmp;

    try {
      tmp = colorConvert.hex.hsl(state.rgb);
    }
    catch(e) {
      console.log(e);
      tmp = [0, 0, 0];
    }

    state.hue        = tmp[0];
    state.saturation = tmp[1];
    state.brightness = tmp[2];
  }


  // The main node definition - most things happen in here
  function LifxNode(n) {
    var node = this;
    var debug = !!n.debug;

    // Create a RED node
    RED.nodes.createNode(this, n);

    this.isOutput = false;

    node.lightID = n.lightID;
    lifxServer.addNode(node.lightID, node.id, node);

    node.state = {
      lightID: n.lightID,
      on: !!n.on,
      duration: n.duration || 0,

      rgb:        n.rgb || defaultRGB,
      hue:        n.hue || 0,
      saturation: n.saturation || 0,
      brightness: n.brightness || 0,
      kelvin:     n.kelvin || 0,
    };

    lifxServer.updateStatusFromNode(node);

    node.on('input', (msg) => {
      var isOn = node.state.on;
      var changeRGB = false;
      var changeHSL = false;
      var changeBrightness = false;
      var changeKelvin = false;

      function payloadToBool(prop, value) {
        if (value === undefined || typeof value !== 'boolean')
          return false;
        node.state[prop] = value;
        return true;
      }

      function payloadToNumber(prop, min, max, value) {
        var tmp;
        if (value === undefined)
          return false;

        if (typeof value === 'number') {
          if (value > max)
            value = max;
          if (value < min)
            value = min;
          node.state[prop] = Math.floor(value);
          return true;
        }

        if (typeof value === 'string') {
          let tmp = parseInt(value, 10);
          if (isNaN(tmp))
            return false;
          if (value > max)
            value = max;
          if (value < min)
            value = min;
          node.state[prop] = Math.floor(tmp);
          return true;
        }
        return false;
      }

      function payloadToHEXColor(prop, value) {
        if (value === undefined || typeof value !== 'string' || !regexRGB.test(value))
          return false;
        node.state[prop] = value;
        return true;
      }

      // 
      payloadToBool('on', msg.payload.on);
      payloadToNumber('duration', 0, 100000, msg.payload.duration);

      // RGB      
      changeRGB = payloadToHEXColor('rgb', msg.payload.rgb);

      // HSL
      changeHSL = payloadToNumber('hue',        0, 360, msg.payload.hue)        || changeHSL;
      changeHSL = payloadToNumber('saturation', 0, 100, msg.payload.saturation) || changeHSL;
      changeBrightness = payloadToNumber('brightness', 0, 100, msg.payload.brightness);

      changeKelvin = payloadToNumber('kelvin', 2500, 9000, msg.payload.kelvin);

      let brightness = node.state.brightness;

      // Convert values HSL
      if (changeRGB) {
        stateRGBToHSL(node.state);
      }
      // Convert values to RGB
      else if (changeHSL) {
        stateHSLToRGB(node.state);
      }
      else if (changeKelvin) {
        let rgb = kelvinToRGB(node.state.kelvin);

        node.state.rgb = '#' + rgbHex(rgb[0], rgb[1], rgb[2]);
        stateRGBToHSL(node.state);
      }

      if (changeBrightness)
        node.state.brightness = brightness;

      if (node.state.on && node.state.brightness < 5)
        node.state.brightness = 5;


      var nodeLight = lifxServer.findLight(node.lightID);

      // No light found or offline
      if (nodeLight == null) {
        return;        
      }

      //if (node.state.on != nodeLight.state.on)
 
      nodeLight.state.on         = node.state.on;
      nodeLight.state.rgb        = node.state.rgb;
      nodeLight.state.hue        = node.state.hue;
      nodeLight.state.saturation = node.state.saturation;
      nodeLight.state.brightness = node.state.brightness;
      nodeLight.state.kelvin     = node.state.kelvin;

      lifxServer.updateStatusFromLight(nodeLight);

      console.log('RGB: %s  HUE: %d  SAT: %d  BRI: %d  Kelvin: %d',
                  node.state.rgb, node.state.hue, node.state.saturation,
                  node.state.brightness, node.state.kelvin);

      if (!nodeLight.info.online) {
        node.send(node.state);
        return;        
      }


      if (isOn && node.state.on) {
        nodeLight.light.on(0);
        nodeLight.light.color(node.state.hue, node.state.saturation, node.state.brightness, node.state.kelvin, node.state.duration);
        //nodeLight.light.colorRgbHex(node.state.rgb, node.state.duration);
      }
      else if (!isOn && node.state.on) {
        nodeLight.light.colorRgb(0, 0, 0);
        nodeLight.light.on(0);
        nodeLight.light.color(node.state.hue, node.state.saturation, node.state.brightness, node.state.kelvin, node.state.duration);
        //nodeLight.light.colorRgbHex(node.state.rgb, node.state.duration);
      }
      else {
        nodeLight.light.off(node.state.duration);
      }

      //node.send(node.state);
    });

    node.on('close', function() {
      lifxServer.removeNode(node.lightID, node.id);
    });
  }

  // Register the node by name. This must be called before overriding any of the
  // Node functions.
  RED.nodes.registerType('node-lifx-in', LifxNode);
};

