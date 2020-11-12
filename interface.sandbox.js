const express = require('express')
const exphbs  = require('express-handlebars');

const app = express()
app.engine('handlebars', exphbs({layoutsDir: __dirname + '/views/layouts'}))
app.set('view engine', 'handlebars');
app.use(express.urlencoded({ extended: true }));

var morgan = require('morgan');
app.use(morgan('dev'));

const multer = require('multer')
const fs = require('fs')
let dir = "./uploads"
if (!fs.existsSync(dir)) {
	fs.mkdirSync(dir)
}
let storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/')
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname)
	}
})
let upload = multer({ storage: storage })

const port = 3000
var hbsContent = {isLogged: false, authmessage: 'User not logged in', username: "", inputCSVLoaded: false, separator: ',', ready: false, started: false}


const csv = require("csv-parser")
csv({ separator: ',' });

const url = require("url")
const request = require("request")
const events = require('events')
var eventsEmitter = new events.EventEmitter()

let input = []
var apiCreds = { username: "", password: "", id: "" }
let logs = []

app.get('/', (req, res) => { 
	if(hbsContent.isLogged && hbsContent.inputCSVLoaded) hbsContent.ready = true
	res.render('main', {layout: "index", data: hbsContent})
})

const readline = require('readline')
const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
})

app.get('/events', function(req, res) {
	res.set({
		'Cache-Control': 'no-cache',
		'Content-Type': 'text/event-stream',
		'Connection': 'keep-alive'
	})
	res.flushHeaders()
	res.write('retry: 10000\n\n')
	eventsEmitter.on('log', (message) => {
		logs.push(message)
		res.write(`data: ${message}\n\n`)
	})
})

app.get('/progressEvents', (req, res) => {
	res.set({
		'Cache-Control': 'no-cache',
		'Content-Type': 'text/event-stream',
		'Connection': 'keep-alive'
	})
	res.flushHeaders()
	res.write('retry: 10000\n\n')
	eventsEmitter.on('progress', (message) => {
		res.write(`data: ${message}\n\n`)
	})
})

app.post('/login', async function(req, res) {
	let authResponse = await checkCredentials(req.body.username, req.body.password)
		.catch((error) => { throw new Error(error) })
	let object = JSON.parse(authResponse.body)
	if (authResponse.statusCode == 200) {
		apiCreds.username = req.body.username
		apiCreds.password = req.body.password
		hbsContent.isLogged = true
		object.results.forEach(element => {
			if(element.id == req.body.id) {
				hbsContent.username = element.name	
			}	
		})
		
	} else {
		hbsContent.isLogged = false
		hbsContent.authmessage = object.detail
	}
	res.redirect('/')
})


app.post('/upload', upload.single('input'), async function(req, res) {
	if(req.file != undefined) {
		hbsContent.inputCSVLoaded = true
		input = await readInputSync("uploads/" + req.file.filename)
        	        .catch(() => { throw new Error("csv parsing failed") } )
	}
	res.redirect('/')
})

app.post('/changeSeparator', (req, res) => {
	csv({ separator: req.body.separator })
	hbsContent.separator = req.body.separator
	res.redirect('/')
})

app.post('/start', async function(req, res) {
	hbsContent.started = true
	res.redirect('/')	
	mainWrapper()
//	sseres.write(`data: test\n\n`)	
})

app.get('/downloadLogs', (req, res) => {
	let name = `logs-${Date.now()}.json`
	fs.writeFileSync(name, JSON.stringify(logs))
	res.download(__dirname + `/${name}`)
})

app.get('/downloadOutputCvs', (req, res) => {
	const { parse } = require('json2csv');
 
	const fields = ['control', 'amount', 'description', 'refundNumber'];
	const opts = { fields };
	 
	try {
		const csv = parse(input, opts);
		let name = `output-${Date.now()}.csv`
		fs.writeFileSync(name, csv)
		res.download(__dirname + `/${name}`)
	} catch (err) {
		console.error(err);
	}		
})

app.listen(port, "127.0.0.1", () => {
	console.log(`server started at http://localhost:${port}`) 
})

async function mainWrapper() {
	for(i=0; i<input.length; i++) {
                let buffer = input[i]
		eventsEmitter.emit("progress", `progress: ${i+1}/${input.length}`)	
                let number = await handleResponseControl(buffer, await queryApiForControl(buffer.control)
                        .catch((error) => { console.log(error) })
                )
		input[i].refundNumber = ""
		if(typeof(number) == 'string') {
			input[i].refundNumber = number
		}
        }
	eventsEmitter.emit("log", "finished")
}

function checkCredentials(username, password) {
        return new Promise(function(resolve, reject) {
                function callback(error, response) {
                        if (error) reject(error)
                        resolve(response)       
                }
                request.get("https://ssl.dotpay.pl/test_seller/api/v1/accounts/", callback).auth(username, password)
        })
}

function readInputSync(filename) {
        return new Promise(function(resolve, reject) {
                const results = []
                fs.createReadStream(filename)
                        .pipe(csv())
                        .on('data', (data) => results.push(data))
                        .on('end', () => resolve(results))
                        .on('error', (error) => reject(error))
        })
}

function queryApiForControl(control) {
        return new Promise(function(resolve, reject) {
                let options = {
                        url: url.parse(url.format({
                                protocol: 'https',
                                hostname: "ssl.dotpay.pl",
                                pathname: "/test_seller/api/v1/operations/",

                                query: {
                                        control: control
                                }
                        })),
                        headers: {
                                "Accept": "application/json"
                        }
                }
                function callback(error, response) { 
                        if (error) reject(error)
                        resolve(response)
                }
                request.get(options, callback).auth(apiCreds.username, apiCreds.password)
        })
}

function refundPayment(paymentNumber, refundOptions) {
        return new Promise(function(resolve, reject) {
                let options = {
                        url: url.parse(url.format({
                                protocol: 'https',
                                hostname: "ssl.dotpay.pl",
                                pathname: "/test_seller/api/v1/payments/" + paymentNumber + "/refund/",
                        })),
                        headers: {
                                "Accept": "application/json",
                        },
                        body: refundOptions,
                        json: true
                }

                function callback(error, response) { 
                        if (error) reject(error)
                        resolve(response)
                }
                request.post(options, callback).auth(apiCreds.username, apiCreds.password)
        })
}

function checkRefundNumberForControlNumber(control) {
        return new Promise(function(resolve, reject) {
                function callback(error, response) {
                        if (error) reject(error)
                        resolve(response)
                }
                request.get(`https://ssl.dotpay.pl/test_seller/api/v1/operations/?type=refund&control=${control}`, callback).auth(apiCreds.username, apiCreds.password)
        })
}

function handleResponseControl(buffer, responseControl) {
	return new Promise(async function(resolveControl) {
       		 let controlData = JSON.parse(responseControl.body)
       		 if (responseControl.statusCode == 200 && controlData.count == 1 && controlData.results[0].status == "completed") {
       		         await handleRefund()
				.then((data) => { 
					resolveControl(data)
				 })
				.catch((error) => { throw new Error(error) })
       		 } else if (controlData.count != 1) {
       		         handleMultipleRecordsForControl()
       		 } else {
       		         eventsEmitter.emit('log', `${buffer.control} wont refund, for unrecognized reason ${relatedOperations}`)
       		 }
		 resolveControl()
       		 async function handleRefund() {
       		         return new Promise(async function(resolve, reject) {

       		                 eventsEmitter.emit('log', `${buffer.control} will be refunded`)
       		                 let refundOptions = { amount: buffer.amount, description: buffer.description, control: buffer.control }
       		                 let responseRefund = await refundPayment(controlData.results[0].number, refundOptions)
       		                         .catch((error) => { reject(error) })
       		                 if (responseRefund.statusCode == 200) {
       		                         eventsEmitter.emit('log', `${buffer.control} transaction number ${controlData.results[0].number} has been refunded successfully`)
       		                         eventsEmitter.emit('log', JSON.stringify(responseRefund.body))
       		                         let refundNumberResponse = await checkRefundNumberForControlNumber(buffer.control)
       		                                 .catch((error) => { reject(error) })
					 let number = JSON.parse(refundNumberResponse.body).results[0].number
       		                         eventsEmitter.emit('log', number)
					 resolve(number)
       		                 } else { 
       		                         eventsEmitter.emit('log', `${buffer.control} transaction number ${controlData.results[0].number} has not been refunded, reason:`)
       		                         eventsEmitter.emit('log', JSON.stringify(responseRefund.body))
       		                 	 resolve()
       		                 }
       		         })
       		 }

       		 function handleMultipleRecordsForControl() { 
       		         if (controlData.count == 0) {
       		                 eventsEmitter.emit('log', `${buffer.control} wont be refunded, no payments records for given control`)
       		         } else {
       		                 eventsEmitter.emit('log', `${buffer.control} wont be refunded, found multiple records`)
       		                 let payments = controlData.results.filter(record => record.type == "payment")
       		                 let refunds = controlData.results.filter(record => record.type == "refund")

       		                 payments.forEach(paymentRecord => {
       		                         let relatedOperations = refunds.find(refundRecord => {
       		                                 let split = refundRecord.related_operation.split('/')
       		                                 let relatedOperationNumber = split[split.length-2]
       		                                 if (relatedOperationNumber == paymentRecord.number) return true
       		                                 else return false
       		                         })
       		                         let message = `${buffer.control} for transaction with number ${paymentRecord.number} found `
       		                         if (relatedOperations.length != 0) message += `refund/refunds: ${JSON.stringify(relatedOperations)}`
       		                         else message += `no refunds`
       		                         eventsEmitter.emit('log', (message))
       		                 })
       		         }
       		 }
	})

}
