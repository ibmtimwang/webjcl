var fs = require('fs');
var os = require('os');
var path = require('path');
var uuid = require('node-uuid');
var spawn = require('child_process').spawn;
var async = require('async');
var config = require('./config.json');


var ISrcProcJob = require('../../framework/ISrcProcJob.js');

// Strict umask
process.umask(0077)

/**
 * JESWorker Constructor
 * 
 * 
 * 
 * 
 * 
 */
var JESWorker = function(file, username, password)
{
	
	var self = this;
	
	// Call ISrcProcJob's constructor.
	ISrcProcJob.call(this);

	this.status = ISrcProcJob.statusCode.new;
	
	if (file == undefined)
		throw "JES has no file!";
	
	this.files = [file];
	this._jclFile = file;
	
	// Figure out where we're placing the files.
	this._tmpDir = os.tmpDir()+'/JESWorker';
	
	
	
	// Make sure we have these.
	this._username = username;
	this._password = password;
	
	


	
	this.time = Date();
	
	
	// outputFiles ought to contain an array of 
	// files generated by the process.
	this.outputFiles = [];
	
	// output will contain what the compilation/execution tells us.
	this.output = '';
	
	
	// Set completion status.
	this.completion = ISrcProcJob.completion.incomplete;
	
	
	/* * * * * * * * * * * * * *
	 * PREPARE JOB             *
	 * * * * * * * * * * * * * */
	async.series(
	[
		function(callback)
		{
			if (self.id != undefined)
				callback();
				
			else
				self.once('setID', callback);
			
			
		},
		this._createWorkspace.bind(this),
		this._writeJobFiles.bind(this),
		this._emitReady.bind(this)
	]);
	
	
}


// Officially inherit from ISrcProcJob
JESWorker.prototype = new ISrcProcJob();
JESWorker.prototype.constructor=JESWorker;


//
//
////////////////////////////////////////////////////////////////////////
// Specialized JESWorker methods.
//

/**
 * JESWorker._createWorkspace
 * 
 * Asynchronously ensures that there are folders for this job to work in.
 * This could possibly be promoted to the superclass later.
 * 
 * @param function callback
 * 	A function that should be called when complete.
 * 
 * TODO: handle errors where making these directories fail.
 * TODO: handle error where the tmp directory can't be written to.
 * 
 */
JESWorker.prototype._createWorkspace = function(callback)
{
	var worker = this;
	
	// Do the following asynchronous calls in sequence.
	async.series(
	[
	
		// 1. Does the temporary directory exist?
		function(next)
		{
			
			fs.exists(worker._tmpDir, function(exists)
			{
				// Make the directory if it does not exist.
				if(!exists)
					fs.mkdir(worker._tmpDir, 0700, next)

				else
					next();
				
			});
			
		},
		
		// 2. Make the unique workspace for this job.
		function(next)
		{
			fs.mkdir(worker._workspace, 0700, next);
		}
	
	
	], function(err, results){
		
		err == null || console.log(err);
		
		callback();
	});
	



}


/**
 * JESWorker._writeJobFiles
 * 
 * This writes the required files to the workspace.
 * 
 * 
 * @param function callback
 * 	A function that should be called when complete.
 * 
 */
JESWorker.prototype._writeJobFiles = function(callback)
{
	
	var self = this;


	// Do the following asynchronous calls in sequence.
	async.series(
	[
		function(next)
		{
			// Write the JCL file to the workspace.
			fs.writeFile(self._jclFilePath, self._jclFile.data, "utf8", next)
		},
		
		
		function(next)
		{
			
			// Write the credentials config to the workspace.
			fs.writeFile(self._configFile, 
			"[JESftp]\n" +
			"server = " + config.host + "\n" +
			"username = " + self._username+ "\n" +
			"password = " + self._password, next);
			
		}
	],
		
	function(err, results)
	{		
			callback();
	});
	
	
}



/**
 * JESWorker._emitReady
 * 
 * Sets the status and emits the ready signal.
 * Could be depricated potentially.
 * 
 * @param function callback
 * 	A function that should be called when complete.
 * 
 * @emits ISrcProcJob.status.ready
 * 
 */
JESWorker.prototype._emitReady = function(callback)
{
	
	this.status = ISrcProcJob.statusCode.ready;
	
	this.emit(ISrcProcJob.statusCode.ready, this);
	
	if (callback != undefined)
		callback();
}



/**
 * JESWorker._destroyWorkspace
 * 
 * Deletes the workspace folder and other cleanup.
 * 
 * 
 */
JESWorker.prototype._destroyWorkspace = function()
{
	
	var self = this;
	
	// Obtain the list of files inside the workspace.
	var files = fs.readdir(this._workspace, function(err, files){
	
		// For each file, delete it.
		for (i in files)
		{
			fs.unlink(self._workspace + '/' + files[i]);
		}
		
		// Remove directory
		fs.rmdir(self._workspace);
		
	});
	
}


JESWorker.prototype.setID = function(id)
{
	if (id == undefined)
	{
		// Generate a unique ID
		this.id  = uuid.v1();
		this._id = this.id;
	}
	
	else
	{
		this.id = id;
		this._id = this.id;
	}
		
	
	this._defineWorkspacePaths();
	
	
	this.emit('setID');
	
}

JESWorker.prototype._defineWorkspacePaths = function()
{
	
	// _workspace should be a clean folder we can use.
	this._workspace = this._tmpDir+"/"+this.id;
	
	// Get the files situated.

	this._jclFilePath = this._workspace+'/'+this._jclFile.path;
	this._configFile = this._workspace+'/.JESftp.cfg';
	
	
}

/**
 * JESWorker.start
 * 
 * Starts processing the job
 * 
 * @emits ISrcProcJob.status.done
 * 
 */
JESWorker.prototype.start = function(callback)
{
	
	var self = this;
	
	this.status = ISrcProcJob.statusCode.running;

	
	
	// Obtain the full path to JESftp.py
	var JESftp_py = path.resolve(__dirname, 'JESftp.py');
	
	
	console.log(this._configFile + this._jclFilePath + this._workspace);
	
	// Invoke JESftp.py with python
	var	python = spawn('python', [JESftp_py, 
	                              '--config', this._configFile,
	                              this._jclFilePath],
	                               {cwd: this._workspace});
	
	
	
	
	// Set things up so that we can obtain output from the script...
	// right now it's appending to the output data member of this object.
	python.stdout.setEncoding("utf8");
	python.stdout.on('data', function (data) 
	{
		self.output += data;
	});
	
	python.stderr.on('data', function (data) 
	{
		self.output += data;
	});
	
	
	
	
	
	// Create a listener for when python exits.
	python.on('exit', function(stream)
	{
		
		
		// Obtain the output file
		fs.readFile(self._workspace + '/test-output.txt', "utf8", function(err, outdata)
		{
			
			// Place the data in our json file object.
			self.outputFiles = [{path: 'test-output.txt', type: 'text/plain', data: outdata}];
			
			// Set status codes.
			self.status = ISrcProcJob.statusCode.done;
			self.completion = ISrcProcJob.completion.success;
			
			// Emit our doneness
			self.emit(ISrcProcJob.statusCode.done, this);
			
			// Clean everything up
			self._destroyWorkspace();
			
			// Exit
			callback();
			
			
		});

		
	});
	
}


JESWorker.prototype.getStruct = function()
{
	
	var clean_job = {}
			
	for (var key in this)
	{
		
		if (key[0] == '_' && key != '_id')
			continue;
			
		clean_job[key] = this[key];

	}
	
	return clean_job;
	
}


module.exports = JESWorker;
