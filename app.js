/*
 * @author Philipp Bahnmüller (742233), Kevin Schrötter (742082)
 */

// Loading node.js modules

var express = require('express');
var app = express();
var port = process.env.PORT || 3000;
var path = require('path');
var xss = require('xss');
var validUrl = require('valid-url');
var helmet = require('helmet');

//#################################################
//Server initialization
var http = require('http')
var server = http.createServer(app);
server.listen(port, function(){
	console.log("Server listening on Port: "+port);
});

//##################################################
//using trusted proxy for bluemix
app.enable('trust proxy');
/*
 * Redirecting http requests to https requests to force https usage on bluemix
 * Original code snipped copied from http://stackoverflow.com/questions/36162840/force-ssl-in-nodejs-bluemix
 */
app.use (function (req, res, next) {
    if (req.secure) {
            // request was via https, so do no special handling
            next();
    } 
	else {
        // request was via http, so redirect to https
		var newUrl = 'https://' + req.headers.host + req.url;
		if(validUrl.isUri(newUrl)){
			res.redirect(newUrl);
		}
		else{
			console.log("ERROR redirecting");
		}
    }
});
/*
 * Forcing encrypted connection for https
 */
app.use(function(req,res,next){
	var schema = req.headers["x-forwarded-proto"];
	if(schema === "https"){
		req.connection.encrypted = true;
	}
	next();
});
// Implement X-XSS-Protection
app.use(helmet.xssFilter());



var io = require('socket.io').listen(server);

var router = express.Router();
/*
 * Cloudant information and credentials
 * Dashboard URL: https://f1309e1c-4774-4f1e-8621-7881c5bc0f78-bluemix.cloudant.com/dashboard.html#/
 */
var Cloudant = require('cloudant'); //for establishing connection with the ibm cloudant service
var me = 'f1309e1c-4774-4f1e-8621-7881c5bc0f78-bluemix';  //Account name
var apiKey = 'veringetneredsorytoricry';	//From Cloudant generated API Key
var apiPW = 'ac834bca3e30393e4208ac1a5aa1c56a1074f6b1';	//Password for the generated API Key

//Functions

var sockets = {};


//Creating a static folder 'public' so that the html files are able to load local scripts and pages
app.use(express.static(path.join(__dirname,'public')));
app.use(router);

//app.use('/static',express.static(path.join(__dirname,'public')));
console.log("Public folder initialized");

/*
 * It seems like Node JS automatically uses a file called index.html
 * for the default route '/'. There it doesn't matter, where exactly the file
 * is located as long as it is somehwhere near the main directory
 * or the public directory
 */
router.get('/login', function(req, res){
	res.sendFile(__dirname + '/public/index.html');
});

/*
 * Route that shows the login page/registration page
 */
router.get('/index', function(req, res){
	res.sendFile(__dirname + '/public/index.html');	
});

/*
 * Route that displays the chat itself
 */
router.get('/chat', function(req, res){
	res.sendFile(__dirname + '/public/chat.html');	
});

/*
 * Route uses for internal testing
 */
router.get('/test', function(req,res){
	res.sendFile(__dirname + '/public/test.html');
});

/*
 * This plays a message to a user when he connects to the chatroom
 */
io.on('connection', function(socket){
	console.log("Connected to server!");
	
	/*
	 * Function that broadcasts a message sent from a single chat user to all other users
	 */
	socket.on('chat message', function(msg){
	msg.msg = xss(msg.msg);
		socket.broadcast.emit('chat message', msg);
	});
	
	/*
	 * This Method sends a broadcast to all chat users when a user disconnects. It also sends the name of the disconnected user
	 */
	socket.on('disconnect',function(){
		if(socket.username){
			io.emit('user disconnect',"User "+socket.username+" disconnected!");
			delete sockets[socket.username];
		}
	});
	
	/*
	 * Function that updates the saved user-socket-pair information whenever a already logged in user changes the html page on the client
	 * It also sends a broadcast to all users saying that a new user including its username connected
	 */
	socket.on('validate user',function(username){
		socket.username = username;
		sockets[username] = socket;
		io.emit('user connect',"User "+username+" connected!");
	});
	
	/*
	 * Function that sends a private message from a user client(the emitting socket) to a receiver(data.to)
	 */
	socket.on('private message',function(data){
		if(sockets[data.to]){
			data.msg = xss(data.msg);
			sockets[data.to].emit('private message',data);
		}
		else{
			socket.emit('error message',{msg: "User '"+data.to+"' not found!"});
		}
	});
	
	/*
	 * This function sends all usernames to the client after it received the /list prompt from the user
	 */
	socket.on('get usernames',function(){
		socket.emit('get usernames',Object.keys(sockets));
	});
 
	/*
	 * This function searches a user given by the client in the database
	 * 0: At first, the database directly searches for the name
	 *    there are several cases that can appear then:
	 * 1: No User found + No New User Creation Request -> ERROR "No such user for login"
	 * 2: No User found + New User Creation Request -> CONFIRM "User created"
	 * 3: User Found + New User Creation Request -> ERROR "Username already taken"
	 * 4: User Found + No New User Creation Request -> ENTER PASSWORD AND Split in 2 again
	 *  4.1 Incorrect password -> ERROR "INCORRECT PASSWORD"
	 *  4.2 Correct password -> CONFIRM "LOGIN SUCCESSFUL" + Redirect to chat
	 */
	socket.on('login request', function(data){
		//Establishing Cloudant Database Connection using Account name and API Key information from Cloudant Dashboard
		Cloudant({account:me, key:apiKey, password:apiPW},function(err,cloudant){
			if(err){
				return console.log('Failed to initialize Cloudant DB cccloudchatdb: '+err.message);
			}
			console.log('');
			console.log('');
			console.log('###########################################');
			console.log("Connection to Cloudant database successful!");
			//Choosing cccloudchatdb as the database that shall be used
			var chatDB = cloudant.db.use("cccloudchatdb");//cloudchatdb is the name of the used database in Cloudant!
			/* 
			 * CASE 0 -> Search for client-given username in database
			 */
			chatDB.find({selector:{username:data.username}},function(er, result){
				console.log("Searching for user: "+data.username+"...");
				if(er){
					throw er;
				}
				//No User Found
				if(!result.docs[0]){
					console.log("User "+data.username+" is not in database!");
					/*
					* CASE 1 No Found User + No New User Creation Request -> It is a login request -> Login-ERROR
					*/
					if(data.newuser === "false"){
						console.log(data.username+" wanted to login...");
						console.log("Username "+data.username+" not found in database!");
						socket.emit('login response',{successful: "false",reason: "This name does not exist!"});
					}
					/*
					 * CASE 2 No Found User + New User Creation Request -> Creation-SUCCESS
					 */
					else{
						console.log(data.username+" wanted to register a new account...");
						    chatDB.insert({username: data.username, password: data.password}, function(err, body, header) {
								if (err) {
									return console.log('[database.insert] ', err.message);
								}
								console.log('New user '+data.username+' created!');
								socket.emit('login response', {successful: 'true'});
							});
					}
				}
				/*
				 * CASE 3 User Found + New User Creation Request -> Creation-ERROR
				 */
				else{
					console.log("User "+data.username+" found!");
					if(data.newuser === "true"){
						console.log(data.username+" wanted to create a new account...");
						console.log("Username " + data.username+" already taken!");
						socket.emit('login response',{successful: 'false',reason: 'Username already taken!'});
					}
					/*
					 * CASE 4 User Found + No New User Creation -> It is a login request -> CHECK PASSWORD
					 */
					else{
						console.log(data.username+" wanted to login...");
						chatDB.find({selector:{password:data.password}},function(er, result){
							console.log("Checking password for "+data.username+"...");
							if(er){
								throw er;
							}
							/*
							 * CASE 4.1 INCORRECT PASSWORD -> Password-ERROR
							 */
							if(!result.docs[0]){
								console.log("Incorrect password for "+data.username+"!");
								socket.emit('login response',{successful: 'flase',reason: 'Incorrect password!'});
							}
							/*
							 * CASE 4.2 CORRECT PASSWORD -> Redirect to chat
							 */
							else{
								console.log("Correct password! "+data.username+" redirected to chatroom!");
								socket.emit('login response',{successful:'true'});
							}
						});
					}
				}
			});
		});
	});
});
 
 