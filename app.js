const port = process.env.PORT || 4000;
const { error } = require('console');
const express = require('express');
const app = express();
const csv = require('fast-csv');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { RestClient  } = require('@signalwire/node')
const dayjs = require('dayjs');
var propertiesReader = require('properties-reader');



// const client = new RestClient({
//     project: 'project.id.signlwire',
//     token: 'api.token.signlwire'
// })
global.__basedir = __dirname;
var properties = propertiesReader(__basedir+'/public/local.properties');
const client = new RestClient(properties.get('project.id.signlwire'), properties.get('api.token.signlwire'), { signalwireSpaceUrl: properties.get("api.signalwire.space.url") });

app.use(express.static(path.join(__dirname, 'public')));
app.engine('html', require('ejs').renderFile);



const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, __basedir + '/uploads/')
    },
    filename: (req, file, cb)=>{
        let now = new Date();
        let timeString = now.getDate() + "-" + now.getMonth() + "-" + now.getFullYear() + "--" + now.getHours() + "-" + now.getMinutes();        
        cb(null, file.fieldname + "-" + timeString + ".csv");
    }
});

const csvFiler = (req, file, cb) => {
    // console.log("mimetype ---",file.mimetype)
    if(file.mimetype.includes("csv")){
        cb(null, true);
    }else{
        cb("Please upload csv file only.", false);
    }
};

const upload = multer({ storage: storage, fileFilter: csvFiler});

app.get("/", (req, res)=>{
    res.render(__dirname + '/public/sendSms.html',{phoneNumber:'+'+properties.get('primary.send.number')})
});

app.get("/sendSms", (req, res)=>{
    res.render(__dirname + '/public/sendSms.html',{phoneNumber:'+'+properties.get('primary.send.number')})
})

app.get("/sendSms/:object", (req, res)=>{
    const obj = JSON.parse(req.params.object);
    // console.log("From " + obj.from);
    // console.log("To " + obj.to);
    // console.log("Body " + obj.body);
    // sendSms(obj.from, obj.to, obj.body, callback =>{
    //     res.send("SMS send --- " + callback(data));
    // });

    client.messages
        .create({from: obj.from, body: obj.body, to: obj.to})
        .then(message => {
            console.log(message.sid);
            res.render(__dirname + '/public/successful.html',{details:message});
        })
        .done();
    
    // res.render(__dirname + '/public/successful.html',{details:message});        
    
})

app.get("/getRecentMessages", (req,res)=>{
    // var allMsgs = [];
    // client.messages.each(messages => {
    //     allMsgs.push(messages);
    //     // console.log(allMsgs);
    // }).done(console.log(allMsgs));
    
    getAllMessages(callback=>{
        res.render(__dirname + "/public/recentMessages.html", {listMsg:callback, dayjs:dayjs});
    })
})

app.get("/uploadCsv", (req,res)=>{
    res.sendFile(__dirname + "/public/uploadCsv.html")
})

app.get("/csvUploadSuccessful/:object", (req, res)=>{
    const obj = JSON.parse(req.params.object);
    res.render(__dirname + "/public/successful.html",{details:obj})
})

app.post("/api/uploadCsv", upload.single("file"), (req, res)=>{
    try{
        if(req.file == undefined){
            return res.status(400).send({
                message: "Please upload a CSV file."
            });
        }
        let csvData = [];
        let filepath = __basedir + '/uploads/' + req.file.filename;
        fs.createReadStream(filepath)
            .pipe(csv.parse({headers:true}))
            .on("error", error =>{
                throw error.message;
            })
            .on("data", (row)=>{
                // console.log(row.phoneNumber + " --- " + row.message);
                if(!isEmptyOrSpaces(row.phoneNumber) && !isEmptyOrSpaces(row.message)){
                    csvData.push(row);    
                }
            })
            .on("end",()=>{
                var callbackData;
                sendBulkMsg(csvData, callback =>{
                    callbackData = callback;
                })
                return res.status(200).json({message: callbackData});
            });
    } catch(err){
        console.log("catch error -", err);
        res.status(500).send({
            message: "Couln not upload the file: " + req.file.originalname + ". Internal server error 😥."
        })
    }
});

async function getAllMessages(callback){
    var myMsgs = client.messages.list({limit:20}).then(messages=>callback(messages));
}

function sendBulkMsg(msgArray, callback){
    // console.log("inside snedBulkMsg ", msgArray);
    // const index = msgArray.findIndex(msgArray => msgArray.to == '');
    var msgCounter = 0;
    msgArray.forEach(msg=>{

        // console.log(msg.message + "type" + typeof msg.message, msg.phoneNumber);
        var message = msg.message;
        var to = msg.phoneNumber;
        
        if(to != null && to != '' && message.length < 1600){
            client.messages
            .create({from: '+'+properties.get('primary.send.number'), body: message, to: '+1'+to})
            .then(message => {
                console.log(message.sid);
            })
            .done(callback("File uploaded successfully. " +msgArray.length + " messages queued for sending."));
        }else{
            callback("Something wrong with file you uploaded. Please check file structure. or Make sure that body of message is not more than 1600 characters long.")
        }
        
    })
    // callback('doneeee')
}

function isEmptyOrSpaces(str){
    return str === null || str.match(/^\s*$/) !== null;
}

app.listen(port, ()=> console.log(`Server started on port ${port}`));