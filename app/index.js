import inquirer from "inquirer";
import chalk from "chalk";
import figlet from "figlet";
import shell from "shelljs";
import fs from 'fs/promises';
import hasher from "js-sha3";
import path from "path";
import * as registry from './utils/registry.js'

const init = () =>{
    console.log(
        chalk.green(
            figlet.textSync("Doc Reg ICP CLI", {
                font: 'Kban',
                horizontalLayout: "default",
                verticalLayout: "fitted"
            })
        )
    )
}
const log = (message, success=true) => {
    if(success){
        console.log(
            chalk.white.bgGreen.bold(message)
        )
    }else{
        console.log(
            chalk.white.bgRed.bold(message)
        )
    }
}
const checkFile = async (filepath) => {
    if(!filepath){
        return;
    }
    let data = shell.find(filepath);
    if(data.code == 1){
        log(data.stderr, false)
        return false;
    }
    return true
}
const hashFile = async (filepath) => {
    try {
        const data = await fs.readFile(filepath, { encoding: 'binary' });
        return {
            name: path.basename(filepath, path.extname(filepath)),
            hash: hasher.sha3_256(data)
        }
    } catch (err) {
    console.log(err);
    }
}
const askQuestions = (steps) => {
    const questions = [
        {
            name: "ACTION",
            type: "list",
            message: "What do you want to do?",
            choices: ["upload-document", "verify-document", "view-your-documents", "get-total-docs-in-registy", "delete-document", "quit"],
        },
        {
            name: "FILEPATH",
            type: "input",
            message: "Enter relative file path: ",
            validate: (filepath) => checkFile(filepath),
        },
        {
            name: "ID",
            type: "input",
            message: "Enter document ID: "
        },
    ];
    return inquirer.prompt(questions[steps]);
}
const printTable = async (data) => {
    console.table(data);
}
const performActions = async (ACTION) => {
    let data;
    let answers;
    let filePayload
    switch (ACTION) {
        case "get-total-docs-in-registy":
            data = await registry.getDocCount();
            log(`Number of Docs in Registry ${data.data.noOfDocs}\n\n`);
            return;
        case "upload-document":
            answers = await askQuestions(1);
            filePayload = await hashFile(answers.FILEPATH)
            data = await registry.addDocument(filePayload);
            console.log(data.data);
            log(`Docs uploaded succesfully\n\n`);
            return;
        case "verify-document":
            answers = await askQuestions(1);
            filePayload = await hashFile(answers.FILEPATH)
            data = await registry.verifyDocument(filePayload);
            if(data.data.msg){
                log(data.data.msg, false)
                console.log("\n\n")
            }else{
                console.log(data.data)
                log(`Docs Verified succesfully\n\n`);
            }
            return;
        case "view-your-documents":
            data = await registry.getUserDocs();
            let array = data.data.docs;
            let arrayInfo = []
            for (let i in array){
                let info = await registry.viewDocument(i);
                info.data.createdAt = new Date(info.data.createdAt / 1000000).toUTCString()
                arrayInfo.push(info.data);
            }
            printTable(arrayInfo);
            console.log("\n\n");
            return;
        case "delete-document":
            answers = await askQuestions(2);
            data = await registry.deleteDocument(answers.ID);
            if(data.data.msg){
                log(data.data.msg, false)
                console.log("\n\n")
            }else{
                console.log(data.data)
                log(`Docs Deleted succesfully\n\n`);
            }
            return;
        default:
            log("No Action Chosen", false);
    }
}
const run = async () => {
    init();
    while(true){
        const answers = await askQuestions(0);
        if(answers.ACTION == "quit"){
            break;
        }
        await performActions(answers.ACTION);
    }
}
run();