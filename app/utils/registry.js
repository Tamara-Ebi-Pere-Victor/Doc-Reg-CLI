import axios from 'axios';
import 'dotenv/config'

export async function getDocCount() {
    try{
        const response = await axios.get('http://127.0.0.1:4943/noOfDocs', {
            params: {
                canisterId: process.env.APP_CANISTER_ID
            }
        });
        return response.data;
    }catch(e){
        console.error(e)
    }      
}

export async function addDocument(docPayload) {
    let data = JSON.stringify(docPayload);
    try{
        const response = await axios.post('http://127.0.0.1:4943/submit-document', 
            data, 
            {
                headers: {
                'Content-Type':  'Content-type: application/json',
                }, 
                maxBodyLength: Infinity,
                params: {
                    canisterId: process.env.APP_CANISTER_ID,
                    callerId: process.env.APP_USER_ID
                }
            }
        );
        return response.data
    }catch(e){
        console.error(e.message);
    }
}

export async function verifyDocument(docPayload){
    try{
        const response = await axios.get(`http://127.0.0.1:4943/verify-document`, {
            params: {
                canisterId: process.env.APP_CANISTER_ID,
                docHash: docPayload.hash
            }
        });
        return response.data;
    }catch(e){
        console.error(e.message)
    }
}

export async function getUserDocs(){
    try{
        const response = await axios.get(`http://127.0.0.1:4943/your-documents/get-docs`, {
            params: {
                canisterId: process.env.APP_CANISTER_ID,
                callerId: process.env.APP_USER_ID
            }
        });
        return response.data;
    }catch(e){
        console.error(e.message)
    }
}

export async function viewDocument(id){
    try {
        const response = await axios.get(`http://127.0.0.1:4943/your-documents/view-doc`, {
            params: {
                canisterId: process.env.APP_CANISTER_ID,
                callerId: process.env.APP_USER_ID,
                documentId: id
            }
        });
        return response.data;
    } catch (e) {
        console.error(e.message)
    }
}

export async function deleteDocument(id) {
    try {
        const response = await axios.delete(`http://127.0.0.1:4943/your-documents/delete-doc`, {
            params: {
                canisterId: process.env.APP_CANISTER_ID,
                callerId: process.env.APP_USER_ID,
                documentId: id
            }
        });
        return response.data;    
    } catch (e) {   
        console.log(e.message)
    }
}