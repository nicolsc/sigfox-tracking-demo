document.addEventListener("DOMContentLoaded", function() {
  var deviceId = /(?!devices\/)([0-F])*$/i.exec(document.location.pathname).shift();
  window.deviceMap = new SigfoxMap(deviceId);
  deviceMap.init('map');
  fetch('/data/devices/'+deviceId+'/messages?limit=5000')
  .then(response => {
    return response.json();
  })
  .then(json => {
    deviceMap.coords = []
    json.messages.forEach(item => {
      if (item && item.computedLocation){
        deviceMap.coords.push([item.computedLocation.lat, item.computedLocation.lng]);
      }
    });
    console.log(`Got ${deviceMap.coords.length} coords`);
    deviceMap.showPolyline();
    deviceMap.map.fitBounds(deviceMap.polyline.getBounds());
  })
  .catch(err => {
    console.log("too bad", err);
  })
});

var SigfoxMap = function(deviceId){
  this.deviceId = deviceId;
  this.leafletToken = window.leafletToken;

  this.init = mapContainerId => {
    this.map = L.map(mapContainerId).setView([0,0], 3);
    this.map.on('zoomend', this.showPolyline);
    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token='+this.leafletToken, {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox.streets',
        accessToken: this.leafletToken
    }).addTo(this.map);
  };
  this.showPolyline = () => {
    this.setPolyline(this.coords);
    this.updateMapView();

  };
  this.clearMarkers = () => {
    if (this.markers){
      this.markers.forEach(marker => marker.remove());
      this.markers = [];
    }
  };
  this.setPolyline = (coords) => {
    console.log(`set Polyline with ${coords.length} inputs`);
    coords = this.removePolylineDuplicates(coords);
    console.log(`Reduced to ${coords.length} points`);

    if (!this.polyline){
      this.polyline = new L.Polyline(coords,{color: 'darkblue'}).addTo(this.map);
      this.markers = [];
    }
    else{
      this.polyline.setLatLngs(coords);

    }
  };
  this.removePolylineDuplicates = (coords) => {
    //Reduce details depending on zoom level
    // + ignore consecutive points at the same location

    var decimals = Math.min(5,Math.floor(this.map.getZoom()/4));
    var mult = Math.pow(10,decimals);
    console.log(`adjust to zoom ${this.map.getZoom()}, use ${decimals} decimals (x${mult})`);


    var output = [];
    var prev = [-1,-1];
    var simplified;
    coords.forEach(entry => {
      if (entry && entry.length==2){
        simplified = [Math.round(mult * entry[0])/mult, Math.round(mult * entry[1])/mult];
      }
      if (simplified[0]!=prev[0] && simplified[1]!=prev[1]){
        output.push(entry);
        prev = simplified;
      }
      else{
        // console.log(`Removed duplicate simplified ${simplified}`);
      }
    });
    return output;
  }
  this.updateMapView = () => {
    this.clearMarkers();
    this.addPolylineMarkers();
    this.updatePolyline();

  };
  this.addPolylineMarkers = () => {
    this.polyline.getLatLngs().forEach(entry => {
      if (entry && entry.lat !== undefined){
        this.markers.push(new L.marker([entry.lat, entry.lng]));
      }
    });
  };
  this.updatePolyline = () => {
    this.polyline.redraw();
    this.markers.forEach(marker => {
      marker.addTo(this.map);
    });
  };
};
