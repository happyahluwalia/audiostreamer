//**********************************************************************************//
//    Copyright (c) Microsoft. All rights reserved.
//    
//    MIT License
//    
//    You may obtain a copy of the License at
//    http://opensource.org/licenses/MIT
//    
//    THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, 
//    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF 
//    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
//    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, 
//    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR 
//    OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE 
//    OR OTHER DEALINGS IN THE SOFTWARE.
//
//**********************************************************************************//

var request = require('request');
var wsClient = require('websocket').client;
var fs = require('fs');
var streamBuffers = require('stream-buffers');

var azureDataMarketClientId = 'MicrosoftSpeechDemo';
var azureDataMarketClientSecret = 'KtgZ/1DEzfVkW07YW8MDR20SNEGOsBauAsnavfI1TjE=';
var speechTranslateUrl = 'wss://dev.microsofttranslator.com/speech/translate?api-version=1.0&from=en&to=fr';

// input wav file is in PCM 16bit, 16kHz, mono with proper WAV header
var file = 'helloworld.wav';

// get all the supported languages for speech/text/text to speech
request.get({
    url: 'https://dev.microsofttranslator.com/languages?api-version=1.0&scope=text,tts,speech',
    headers: {
        'Accept-Language': 'fr' // the language names will be localized to the 'Accept-Language'
    }
},
function (error, response, body) {
    if (!error && response.statusCode == 200) {
        
        // helper functions for sorting and getting voices given a language code
        var nameSortFunc = function (x, y) { return x.name.localeCompare(y.name); };
        var getVoices = function (code) { return ttsDict[code] == null ? null : ttsDict[code].sort(nameSortFunc).map(function (item) { return item.name; }) };
        
        var jsonBody = JSON.parse(body);
        
		// list of languages that support speech input (the 'from' language in speech/translate)
        var speechDict = {};
        var speechLang = jsonBody.speech;
        for (var speechCode in speechLang) {
            speechDict[speechLang[speechCode].language] = { name : speechLang[speechCode].name, code: speechCode };
        }

		// list of text to speech output voices
        var ttsDict = {};
        var ttsLang = jsonBody.tts;
        for (var voiceName in ttsLang) {
            var langCode = ttsLang[voiceName].language;
            if (ttsDict[langCode] == null)
                ttsDict[langCode] = [];
            ttsDict[langCode].push({ name: ttsLang[voiceName].regionName + ' (' + ttsLang[voiceName].displayName + ' ' + ttsLang[voiceName].gender + ')', code: voiceName });
        }
        
		// list of languages that we can use for text translation (the 'to' language in speech/translate)
        var langArr = [];
        var textLang = jsonBody.text;
        for (var langCode in textLang) {
            var item = {
                name : textLang[langCode].name, 
                code : langCode
            };
            
			// get the list of voices for this language code
            var voices = getVoices(langCode);
            if (voices != null)
                item.voices = voices;
            
			// does the language support speech input
            if (speechDict[langCode] != null)
                item.speech = speechDict[langCode];

            langArr.push(item);
        }
        
        // sort the list based on name
        langArr.sort(nameSortFunc);
        
        // print out to console
        console.log(langArr);
    }
});

// speech translalate api

// get Azure Data Market Access Token
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
			
			// connect to the speech translate api
			var ws = new wsClient();
			
			// event for connection failure
			ws.on('connectFailed', function (error) {
				console.log('Initial connection failed: ' + error.toString());
			});
									
			// event for connection succeed
			ws.on('connect', function (connection) {
				console.log('Websocket client connected');

				// process message that is returned
				connection.on('message', processMessage);
				
				connection.on('close', function (reasonCode, description) {
					console.log('Connection closed: ' + reasonCode);
				});

				// print out the error
				connection.on('error', function (error) {
					console.log('Connection error: ' + error.toString());
				});
				
				// send the file to the websocket endpoint
				sendData(connection, file);
			});
			
			// connect to the service
			ws.connect(speechTranslateUrl, null, null, { 'Authorization' : 'Bearer ' + accessToken });

		}
	}
);

// process the respond from the service
function processMessage(message) {
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
function sendData(connection, filename) {
	
	// the streambuffer will raise the 'data' event based on the frequency and chunksize
	var myReadableStreamBuffer = new streamBuffers.ReadableStreamBuffer({
		frequency: 100,   // in milliseconds. 
		chunkSize: 32000  // 32 bytes per millisecond for PCM 16 bit, 16 khz, mono.  So we are sending 1 second worth of audio every 100ms
	});
	
	// read the file and put it to the buffer
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
		console.log('All data sent, closing connection');
		connection.close(1000);
	});
}
