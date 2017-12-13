'use strict';


const Hapi = require('hapi');
const moment = require('moment');
const API_ROOT = 'http://backend.sigfox.com/api/';
const requestp = require('request-promise-native');
const server = new Hapi.Server({
    host: process.env.HOST || '0.0.0.0',
    port: process.env.PORT || 8001,
    routes: {
        files: {
            relativeTo: require('path').join(__dirname, 'public')
        }
    }
});

const listDevices = (request, h) => {
 if (!process.env.API_LOGIN || !process.env.API_PASSWORD){
   return h.response("Please set API_LOGIN & API_PASSWORD env vars").code(403);
 }
 return requestp({
   uri:`${API_ROOT}devicetypes`,
   auth: {user: process.env.API_LOGIN, password: process.env.API_PASSWORD},
   method: 'GET',
   json: true
 })
 .then(result => {
   console.log('Done', result)
   if (!result || !result.data || !result.data.length){
     return h.view('home', {devicetypes:[]});
   }
   console.log(`${result.data.length} device types`);

   return Promise.all(result.data.map(devicetype => {
     console.log(`Retrieve devices for ${devicetype.name}`);
      return requestp({
       method:'GET',
       auth:{user: process.env.API_LOGIN, password: process.env.API_PASSWORD},
       uri:`${API_ROOT}devicetypes/${devicetype.id}/devices`,
       json:true
     })
   }))
   .then(results => {
    var devices = [];
    results.forEach(item => {devices = devices.concat(item.data)});
    devices.forEach((item,key) => {devices[key].lastSeen = moment(item.last * 1000).fromNow()})
    return h.view('home',{devices:devices});
   })
   .catch(err =>{
     console.error(`Unable to retrieve data: ${err.message}`)
     return h.response(`Unable to retrieve data: ${err.message}`).code(500);
   });

 })
 .catch(err => {
   console.error('err',err);
   return h.response(err.message).code(500);
 });
};

var paginationCrawl = (reqOptions, limitEntries, fetched) => {
  var req = requestp(reqOptions);
  return new Promise((resolve, reject) => {
    console.log(`Fetch ${reqOptions.uri}`);
    req.then(json => {
      json.data.forEach((item,idx) => {
        var momentdate = moment(item.time*1000);
        json.data[idx].dateStr = momentdate.format('lll');
        json.data[idx].fromNow = momentdate.fromNow();
      });
      var data = fetched.concat(json.data);
      if (!json.paging || !json.paging.next || data.length >= limitEntries){
        console.log(`😀  crawl over, ${data.length} entries`);
        data.length = limitEntries;
        return resolve({data:data});
      }
      reqOptions.uri = json.paging.next;
      return paginationCrawl(reqOptions, limitEntries,data).then(resolve);

    })
    .catch(err => {
      return reject(err);
    });
  });
};
/**
 * Get {opts.limit} messages sent by device {opts.id} since {opts.since} & before {opts.before}
 **/
const getDeviceMessages = (opts) => {
 //Force down limit to 100 if greater, as it would trigger a 400 reply from Sigfox Cloud
  var reqOptions = {
   method:'GET',
   auth:{user: process.env.API_LOGIN, password: process.env.API_PASSWORD},
   uri:`${API_ROOT}devices/${opts.id}/messages?limit=${Math.min(100,opts.limit)}&`,
   json:true
 };
 if (opts.before && !isNaN(new Date(opts.before).getTime())){
   reqOptions.uri+= `&before=${opts.before}`;
 }
 if (opts.since && !isNaN(new Date(opts.since).getTime())){
   reqOptions.uri+= `&since=${opts.since}`;
 }
 return paginationCrawl(reqOptions, opts.limit, []);
};
/**
 * Device History as JSON
 * URI Param : deviceId
 * Querystring :
 *  - limit : max number of messages to retrieve. Defaults to 100
 *  - before : get only messages older than this timestamp
 **/
const deviceHistory = (request, h) => {
  request.params.id = request.params.id.toLowerCase();
console.log(request.query)
  var limit = request.query.limit || 1000;
  var before = request.query.before ? new Number(request.query.before) : null;
  var since = request.query.since ? new Number(request.query.since) : null;
  return getDeviceMessages({
    id: request.params.id,
    limit: limit,
    before: before,
    since: since
  })
  .then(result => {
    if (!result || !result.data || !result.data.length){
      console.log('results', result)
      return h.view('device', {id:request.params.id, messages:[], leafletToken:process.env.LEAFLET_TOKEN});
    }
    console.log(`Device ${request.params.id} - Got ${result.data.length} messages`);
    return h.response({id:request.params.id, messages:result.data});
  })
  .catch(err=>h.response({err:err.message}).code(500));
};
/**
  * Device home devicePage
  **/
const devicePage = (request, h) => {
  return h.view('device',{id:request.params.id.toLowerCase(), leafletToken:process.env.LEAFLET_TOKEN});
};
server.route({
    method: 'GET',
    path:'/',
    handler: listDevices
});
server.route({
  method: 'GET',
  path: '/data/devices/{id}/messages',
  handler: deviceHistory
});
server.route({
  method: 'GET',
  path: '/devices/{id}',
  handler: devicePage
});

server.register([require('vision'), require('inert')])
.then(()=>{
  server.route({
    method: 'GET',
    path: '/scripts/{params*}',
    handler: {
      directory: {
        path: 'scripts',
        redirectToSlash: true,
        index: false
      }
    }
  });
  server.views({
      engines: {
          html: require('handlebars')
      },
      relativeTo: __dirname,
      path: 'views'
  });
  server.start()
  .then(console.log('Server running at:', server.info.uri))
  .catch(err => {throw err;});
})
.catch(err=> {throw err;} );
