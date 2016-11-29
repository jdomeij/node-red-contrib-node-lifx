"use strict";
var nodeLifx = require('node-lifx');
var colorConvert = require('color-convert');
var kelvinToRGB = require('kelvin-to-rgb');
var rgbHex = require('rgb-hex');


function LifxServer() {
  var self = this;

  this.lifxClient = null;
  this.lifxNodeCount = 0;

  this.lifxLights = {};
  this.lifxLightLabels = {};

  this.nodeList = {};

  this.lifxConfig = {
    debug: false
  };

  this.defaultRGB = '#555555';

  this.lifxClient = new nodeLifx.Client();

  this.lifxClient.on('light-new', (light) => {
    //console.log('light-new', light);
    let newLightID = light.id;

    var newLight = {
      light: light,
      info: {
        id: light.id,
        address: light.address,
        port: light.port,
        label: null,
        online: (light.status === 'on')
      },
      state: {
        on: true,
        hue: 0,
        saturation: 0,
        brightness: 0,
        kelvin: 3500,
        rgb: self.defaultRGB
      }
    };

    self.lifxLights[newLightID] = newLight;
    self.lifxLabelUpdate(light.label, newLight);

    light.getState((err, info) => {
      newLight.state.on = (info.power === 1);

      newLight.state.hue        = info.color.hue;
      newLight.state.saturation = info.color.saturation;
      newLight.state.brightness = info.color.brightness;
      newLight.state.kelvin     = info.color.kelvin;
      newLight.state.rgb        = info.color.rgb;

      self.lifxLabelUpdate(info.label, newLight);
      self.updateStatusFromLight(newLight);
    });
  });

  this.lifxClient.on('light-offline', (light) => {
    let newLightID = light.id;
    if (!self.lifxLights.hasOwnProperty(newLightID))
      return;

    var newLight = self.lifxLights[newLightID];
    newLight.info.online = false;

    self.updateStatusFromLight(newLight);
  })

  this.lifxClient.on('light-online', (light) => {
    let newLightID = light.id;

    if (!self.lifxLights.hasOwnProperty(newLightID))
      return;

    var newLight = self.lifxLights[newLightID];
    newLight.info.online = true;
    light.getState((err, info) => {
      var isOn = (info.power === 1)
      if (!newLight.state.on && isOn) {
        light.off(0);
      }
      else {
        light.color(newLight.state.hue, newLight.state.saturation, newLight.state.brightness, newLight.state.kelvin, 0);
        light.on(0);
      }

      self.lifxLabelUpdate(info.label, newLight);
      self.updateStatusFromLight(newLight);
    });
  })

  this.lifxClient.init(this.lifxConfig);
}



/**
 * Update label lookup table used for Lifx lamp
 * @param  {string} label New label
 * @param  {object} light Current light with old label
 */
LifxServer.prototype.lifxLabelUpdate = function lifxLabelUpdate(label, light) {
  var self = this;

  if (typeof light.info.label === 'string' &&
      light.info.label != '' && 
      self.lifxLightLabels.hasOwnProperty(light.info.label)) {
    delete self.lifxLightLabels[light.info.label];
    light.info.label = null;
  }

  if (typeof label === 'string' &&
      label != '' &&
      !self.lifxLightLabels.hasOwnProperty(label)) {
    self.lifxLightLabels[label] = light;
    light.info.label = label;
  }
}


/**
 * Update node icon state depending on light state
 * @param  {object} node  Flow node
 * @param  {light}  light Lifx light
 */
LifxServer.prototype.updateStatus = function updateStatus(node, light) {
  if (!light.info.online) {
    node.status({fill:"red",shape:"ring",text:"disconnected"});
  } else if (!light.state.on) {
    node.status({fill:"grey",shape:"dot",text:"off"});
  } else {
    node.status({fill:"yellow",shape:"dot",text: `on (${light.state.hue}° ${light.state.saturation}% ${light.state.brightness}%)`});
  }

  if (node.isOutput === true)
    node.send(light.state);
}

/**
 * Using node get light and update icon for the node
 * @param  {object} node Flow node
 */
LifxServer.prototype.updateStatusFromNode = function updateStatusFromNode(node) {
  var light = null;
  if (this.lifxLights.hasOwnProperty(node.lightID)) {
    light = this.lifxLights[node.lightID];
  }
  else if (this.lifxLightLabels.hasOwnProperty(node.lightID)) {
    light = this.lifxLightLabels[node.lightID];
  }
  else {
    return;
  }
  this.updateStatus(node, light);
};

/**
 * Using light find all connected nodes and update icon for them
 * @param  {object} light Lifx light
 */
LifxServer.prototype.updateStatusFromLight = function updateStatusFromLight(light) {
  var self = this;

  if (this.nodeList.hasOwnProperty(light.info.id)) {
    let tmp = this.nodeList[light.info.id];
    Object.keys(tmp).forEach((item) => {
      self.updateStatus(tmp[item], light);
    });
  }

  if (typeof light.info.label === 'string' &&
      light.info.label !== '' && 
      this.nodeList.hasOwnProperty(light.info.label)) {

    let tmp = this.nodeList[light.info.label];
    Object.keys(tmp).forEach((item) => {
      self.updateStatus(tmp[item], light);
    });
  }
};


LifxServer.prototype.addNode = function addNode(lightID, nodeID, node) {
  if (!this.nodeList.hasOwnProperty(lightID))
    this.nodeList[lightID] = {};
  this.nodeList[lightID][nodeID] = node;
};

LifxServer.prototype.removeNode = function removeNode(lightID, nodeID) {
  if (typeof lightID === 'string' && lightID !== '')
    delete this.nodeList[lightID][nodeID];
};

LifxServer.prototype.findLight = function getLight(lightID) {
  // Search found linghts by id
  if (this.lifxLights.hasOwnProperty(lightID)) {
    return this.lifxLights[lightID];
  }
  
  // Search by label
  if (this.lifxLightLabels.hasOwnProperty(lightID)) {
    return this.lifxLightLabels[lightID];
  }

  return null;
}


var globalLifxServer = null;
var globalClientCount = 0;

function addNode(lightID, nodeID, node) {
  if (!globalLifxServer)
    globalLifxServer = new LifxServer();

  globalLifxServer.addNode(lightID, nodeID, node);
  globalClientCount++;
}


function removeNode(lightID, nodeID) {
  globalLifxServer.removeNode(lightID, nodeID);
  globalClientCount--;

  if (globalClientCount <= 0) {
    globalLifxServer.lifxLights = {};
    globalLifxServer.lifxLightLabels = {};
    globalLifxServer.nodeList = {};

    globalLifxServer.lifxClient.stopDiscovery();
    globalLifxServer.lifxClient.stopSendingProcess();
    globalLifxServer.lifxClient.destroy();
    globalLifxServer.lifxClient = null;

    globalClientCount = 0;

    globalLifxServer = null;
  }
}

function updateStatusFromNode(node) {
  return globalLifxServer.updateStatusFromNode(node);
}

function updateStatusFromLight(light) {
  return globalLifxServer.updateStatusFromLight(light);
}

function findLight(lightID) {
  return globalLifxServer.findLight(lightID);
}

module.exports.addNode = addNode;
module.exports.removeNode = removeNode;
module.exports.updateStatusFromNode = updateStatusFromNode;
module.exports.updateStatusFromLight = updateStatusFromLight;
module.exports.findLight = findLight;
