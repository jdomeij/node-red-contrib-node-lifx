var lifxServer = require('./lifx-server.js');

module.exports = function(RED) {
  "use strict";

  var defaultRGB = '#555555';
  var regexRGB = /^#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

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
    };

    lifxServer.updateStatusFromNode(node);

    node.on('input', (msg) => {
      var light = lifxServer.findLight(node.lightID);

      // No light found or offline
      if (light == null) {
        return;        
      }

      var isOn = light.state.on;
      var changeRGB = false;
      var changeHEX = false;
      var changeHSL = false;
      var changeBrightness = false;
      var changeKelvin = false;

      function payloadToBool(prop, value) {
        if (value === undefined || typeof value !== 'boolean')
          return false;
        light.state[prop] = value;
        return true;
      }

      function parseNumber(min, max, value) {
        var tmp;
        if (value === undefined)
          return null;

        if (typeof value === 'number') {
          if (value > max)
            value = max;
          if (value < min)
            value = min;
          return Math.floor(value);
        }

        if (typeof value === 'string') {
          let tmp = parseInt(value, 10);
          if (isNaN(tmp))
            return null;
          if (value > max)
            value = max;
          if (value < min)
            value = min;
          return Math.floor(tmp);
        }

        return null;
      }

      function payloadToNumber(prop, min, max, value) {
        var tmp = parseNumber(min, max, value);
        if (tmp === null)
          return false;
        light.state[prop] = tmp;
        return true;
      }

      function payloadToHEXColor(prop, value) {
        if (value === undefined || typeof value !== 'string' || !regexRGB.test(value))
          return false;
        light.state[prop] = value;
        return true;
      }

      // Don't save duration
      var duration = parseNumber(0, 100000, msg.payload.duration);
      if (duration === null)
        duration = 200;

      // On/Off
      payloadToBool('on', msg.payload.on);

      // RGB      
      changeHEX = payloadToHEXColor('hex', msg.payload.hex);

      changeRGB = payloadToNumber('red', 0, 255, msg.payload.red);
      changeRGB = payloadToNumber('green', 0, 255, msg.payload.green) || changeRGB;
      changeRGB = payloadToNumber('blue', 0, 255, msg.payload.blue)   || changeRGB;

      // HSL
      changeHSL = payloadToNumber('hue',        0, 360, msg.payload.hue)        || changeHSL;
      changeHSL = payloadToNumber('saturation', 0, 100, msg.payload.saturation) || changeHSL;

      // Kelvin
      changeKelvin = payloadToNumber('kelvin', 2500, 9000, msg.payload.kelvin);

      // Brightness
      changeBrightness = payloadToNumber('brightness', 0, 100, msg.payload.brightness);

      // Remember brightness
      let brightness = light.state.brightness;


      if (changeHSL) {
        lifxServer.stateColorUpdate('hsl', light.state);
      }

      // Convert values HSL
      else if (changeHEX) {
        lifxServer.stateColorUpdate('hex', light.state);
      }

      else if (changeRGB) {
        lifxServer.stateColorUpdate('rgb', light.state);
      }

      else if (changeKelvin) {
        // Don't modify brightness when changing kelvin
        changeBrightness = true;
        lifxServer.stateColorUpdate('kelvin', light.state);
      }

      // If we modified brightness keep it
      if (changeBrightness)
        light.state.brightness = brightness;

      // Don't allow brightness below 5 (this is to differentiate between off and on)
      if (light.state.on && light.state.brightness < 5)
        light.state.brightness = 5;

      lifxServer.updateStatusFromLight(light);

      console.log('HEX: %s  HUE: %d  SAT: %d  BRI: %d  Kelvin: %d',
                  light.state.hex, light.state.hue, light.state.saturation,
                  light.state.brightness, light.state.kelvin);

      if (isOn && light.state.on) {
        light.light.on(0);
        light.light.color(light.state.hue, light.state.saturation, light.state.brightness, 3500, duration);
        //nodeLight.light.colorRgbHex(node.state.rgb, node.state.duration);
      }
      else if (!isOn && light.state.on) {
        // Initialize
        light.light.color(0, 0, 5, 0, 0);
        light.light.on(0);
        light.light.color(light.state.hue, light.state.saturation, light.state.brightness, 3500, duration);
        //nodeLight.light.colorRgbHex(node.state.rgb, node.state.duration);
      }
      else {
        light.light.off(duration);
      }
    });

    node.on('close', function() {
      lifxServer.removeNode(node.lightID, node.id);
    });
  }

  // Register the node by name. This must be called before overriding any of the
  // Node functions.
  RED.nodes.registerType('node-lifx-in', LifxNode);
};

