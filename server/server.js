/**
 * https://www.sitepoint.com/real-time-apps-websockets-server-sent-events/
 * http://stackoverflow.com/questions/16392260/which-websocket-library-to-use-with-node-js?rq=1
Audio capture
 http://cordova.apache.org/docs/en/6.x/reference/cordova-plugin-media-capture/index.html#page-toc-source

 http://cordova.apache.org/plugins/?platforms=cordova-android%2Ccordova-ios&sortBy=Recently%20Updated
 https://www.npmjs.com/package/cordova-plugin-media
 https://www.npmjs.com/package/cordova-plugin-media-stupra

 Ionic file access
 https://www.airpair.com/ionic-framework/posts/ionic-file-browser-app
 */


 var request = require('request');
 var wsClient = require('websocket').client;
 var fs = require('fs');
 var streamBuffers = require('stream-buffers');

 var azureDataMarketClientId = 'MicrosoftSpeechDemo';
 var azureDataMarketClientSecret = 'KtgZ/1DEzfVkW07YW8MDR20SNEGOsBauAsnavfI1TjE=';
 var speechTranslateUrl = 'wss://dev.microsofttranslator.com/speech/translate?api-version=1.0&from=en&to=fr';


var binaryServer = require('binaryjs').BinaryServer,
    https = require('https'),
    wav = require('wav'),
    opener = require('opener'),
    fs = require('fs'),
    connect = require('connect'),
    serveStatic = require('serve-static'),
    UAParser = require('./ua-parser');

var uaParser = new UAParser();

if(!fs.existsSync("recordings"))
    fs.mkdirSync("recordings");

var options = {
    //Out of box
    // key:    fs.readFileSync('ssl/server.key'),
    // cert:   fs.readFileSync('ssl/server.crt'),

     //Generated using openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 100 -nodes
     key:    fs.readFileSync('ssl/key.pem'),
     cert:   fs.readFileSync('ssl/cert.pem'),
};

var app = connect();

app.use(serveStatic('public'));

var server = https.createServer(options,app);
server.listen(9191);

opener("https://localhost:9191");

var server = binaryServer({server:server});

server.on('connection', function(client) {
    console.log("new connection...");
    var fileWriter = null;

    var userAgent  =client._socket.upgradeReq.headers['user-agent'];
    uaParser.setUA(userAgent);
    var ua = uaParser.getResult();

    client.on('stream', function(stream, meta) {
        console.log("Stream Start@" + meta.sampleRate +"Hz");
        var fileName = "recordings/"+ ua.os.name +"-"+ ua.os.version +"_"+ new Date().getTime()  + ".wav"
        fileWriter = new wav.FileWriter(fileName, {
            channels: 1,
            sampleRate: 16000, //Harpreet meta.sampleRate,
            bitDepth: 16
        });
        //Harpreet

        getMicrosoftToken(stream,client);
        //stream.pipe(fileWriter);
    });
    //Harpreet
    var fileReturn = fs.createReadStream('/Users/harpreetahluwalia/Documents/workspace/playarea/node/AudioStreamer/helloworld.wav');
    client.send(fileReturn);

    client.on('close', function() {
        if (fileWriter != null) {
            fileWriter.end();
        }
        console.log("Connection Closed");
    });
});

function getMicrosoftToken(stream, clientSocket){
  var pclientSocket = clientSocket;
  console.log("Inside ms token");

  request.post(
  	'https://datamarket.accesscontrol.windows.net/v2/OAuth2-13',
  	{
  		form : {
  			grant_type : 'client_credentials',
  			client_id : azureDataMarketClientId,
  			client_secret : azureDataMarketClientSecret,
  			scope : 'http://api.microsofttranslator.com'
  		}
  	},

  	// once we get the access token, we hook up the necessary websocket events for sending audio and processing the response
  	function (error, response, body) {
  		if (!error && response.statusCode == 200) {

  			// parse and get the acces token
  			var accessToken = JSON.parse(body).access_token;
        console.log("MS - Got the access token");
  			// connect to the speech translate api
  			var ws = new wsClient();
        console.log("MS - Created client to connect to MS");
  			// event for connection failure
  			ws.on('connectFailed', function (error) {
  				console.log('MS - Initial connection failed: ' + error.toString());
  			});

  			// event for connection succeed
  			ws.on('connect', function (connection) {
  				console.log('MS - Websocket client connected');

  				// process message that is returned
  				connection.on('message', function(message){
            console.log(message);
            var fileReturn = fs.createReadStream('/Users/harpreetahluwalia/Documents/workspace/playarea/node/AudioStreamer/helloworld.wav');
            console.log(pclientSocket);
            pclientSocket.stream(fileReturn);
            console.log("Emitting message to the browser");
            //console.log(message);
            //console.log(pclientSocket);
          });

  				connection.on('close', function (reasonCode, description) {
  					console.log('MS - Connection closed from MS: ' + reasonCode);
  				});

  				// print out the error
  				connection.on('error', function (error) {
  					console.log('MS - Connection error: ' + error.toString());
  				});

  				// send the file to the websocket endpoint
  				sendData(connection, stream);
  			});

  			// connect to the service
  			ws.connect(speechTranslateUrl, null, null, { 'Authorization' : 'Bearer ' + accessToken });

  		}
  	}
  );

}


// process the respond from the service
function processMessage(message, clientSocket) {
  console.log("MS - Inside processMessage");
  clientSocket.send(message);
  console.log('Send data back to client');

	if (message.type == 'utf8') {
		var result = JSON.parse(message.utf8Data)
		console.log('type:%s recognition:%s translation:%s', result.type, result.recognition, result.translation);
	}
	else {
		// text to speech binary audio data if features=texttospeech is passed in the url
		// the format will be PCM 16bit 16kHz mono
		console.log(message.type);
	}
}

// load the file and send the data to the websocket connection in chunks
function sendData(connection, stream) {
  // input wav file is in PCM 16bit, 16kHz, mono with proper WAV header
  var filename = 'helloworld.wav';
  console.log("MS - Inside SendData");
	// the streambuffer will raise the 'data' event based on the frequency and chunksize
	var myReadableStreamBuffer = new streamBuffers.ReadableStreamBuffer({
		frequency: 100,   // in milliseconds.
		chunkSize: 32000  // 32 bytes per millisecond for PCM 16 bit, 16 khz, mono.  So we are sending 1 second worth of audio every 100ms
	});

	// read the file and put it to the buffer
	//myReadableStreamBuffer.put(stream);
  myReadableStreamBuffer.put(fs.readFileSync(filename));
    // silence bytes.  If the audio file is too short after the user finished speeaking,
    // we need to add some silences at the end to tell the service that it is the end of the sentences
    // 32 bytes / ms, so 3200000 = 100 seconds of silences
	myReadableStreamBuffer.put(new Buffer(3200000));

	// no more data to send
	myReadableStreamBuffer.stop();

	// send data to underlying connection
	myReadableStreamBuffer.on('data', function (data) {
		connection.sendBytes(data);
	});

	myReadableStreamBuffer.on('end', function () {
		console.log('MS - All data sent, closing connection');
		connection.close(1000);
	});
}
