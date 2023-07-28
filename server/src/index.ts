import { $query, $update, Record, StableBTreeMap, Vec, Tuple, blob, nat16, match, nat64, ic, Opt, Principal, int32 } from 'azle';
import encodeUtf8 from 'encode-utf8';
import decodeUtf8 from 'decode-utf8';
import UrlPattern from 'url-pattern';

class ID {
    id: string;
    caller: string;
    canister: string;
};

class Caller{
    caller: string;
    canister: string;
}

class Hash {
    hash: string;
    canister: string;
}

class Request {
    pathVariable?: Hash | ID | Caller;
    payload?: object
};

class Response {
    data: object;
};

type HttpResponse = Record<{
    status_code: nat16;
    headers: Vec<Tuple<[string, string]>>;
    body?: blob;
    upgrade: Opt<boolean>;
}>;

type HttpRequest = Record<{
    method: string;
    url: string;
    headers: Vec<Tuple<[string, string]>>;
    body: blob;
    upgrade: Opt<boolean>;
}>;


type Handler = {
    handle: (req: Request) => Response
    request: Request
}

type Document = Record<{
    id: string;
    name: string;
    hash: string;
    createdAt: nat64;
    owner: Principal;
}>

type DocumentPayload = Record<{
    name: string;
    hash: string;
}>

let nextDocumentID: int32 = 0;

// this is only exposed to doc owners;
const id2HashStorage = new StableBTreeMap<string, blob>(0, 100, 1024);

// this is exposed to everyone;
const hash2DocStorage = new StableBTreeMap<blob, Document>(1, 10000, 1_000_000); 

const userDocMapping = new StableBTreeMap<Principal, Vec<string>>(2, 100, 100_000)

function getNoOfDocuments(req: Request): Response {
    return {data: {noOfDocs: id2HashStorage.len().toString()} };
}

function addDocument(req: Request): Response {
    const payload: DocumentPayload = req.payload as DocumentPayload;
    const payloadCaller = req.pathVariable as Caller;
    // create Document object
    let owner = Principal.fromText(payloadCaller.caller);
    const Document: Document = { id: nextDocumentID.toString(), createdAt: ic.time(), owner, ...payload };
    // update storage
    let encodedHash = stringToBlob(Document.hash);
    id2HashStorage.insert(Document.id.toString(), encodedHash);
    hash2DocStorage.insert(encodedHash, Document);
    // update user storage
    match(userDocMapping.get(owner), {
        Some: (map) => {
            map.push(nextDocumentID.toString());
            userDocMapping.insert(owner, map);
        },
        None: () => {
            let newMap: Vec<string> = [nextDocumentID.toString()];
            userDocMapping.insert(owner, newMap);
        }  
    });
    const response:  Response = { data: { product: payload } };
    nextDocumentID++;
    return response;
}

function verifyDocument(req: Request): Response {
    const payload: Hash = req.pathVariable as Hash;
    let response: Response;
    // encode hash
    let encodedHash = stringToBlob(payload.hash);
    // check if hash exists
    return match(hash2DocStorage.get(encodedHash), {
        Some: (document) => response =  { data: {name: document.name, owner: document.owner.toString(), createdAt: document.createdAt.toString()} },
        None: () => response =  { data: { msg: `document with hash=${payload.hash} not found` } }
    });
}

function getUserDocs(req: Request): Response{
    const payload = req.pathVariable as Caller;
    let response: Response;
    const user = Principal.fromText(payload.caller)

    return match(userDocMapping.get(user), {
        Some: (docs) => response = {data: {docs}},
        None: () => response = {data: []}
    });
}

function viewDocument(req: Request): Response {
    const payload = req.pathVariable as ID;
    let owner = Principal.fromText(payload.caller);
    let response: Response;
    let emptyMap: Vec<string> = [];

    const userMap = match(userDocMapping.get(owner), {
        Some: (map) => map,
        None: () => emptyMap
    });

    if (userMap.length == 0 || !userMap.includes(payload.id)) {
        return response = { data: { msg: `you do have access to document with id=${payload.id}`} }
    }
    const docHash = id2HashStorage.get(payload.id);
    return match(docHash, {
        Some: (docInfo) => {
            const doc = hash2DocStorage.get(docInfo);
            return response = { data: { id: doc.Some?.id, name: doc.Some?.name, createdAt: doc.Some?.createdAt.toString() } };
        },
        None: () => response = { data: { msg: `document with id=${payload.id} not found.` } }
    });
}

function deleteDocument(req: Request): Response {    
    const payload = req.pathVariable as ID;
    let owner = Principal.fromText(payload.caller);
    let response: Response;

    let emptyMap: Vec<string> = []
    
    const userMap = match(userDocMapping.get(owner), {
        Some: (map) => map,
        None: () => emptyMap
    });

    if (userMap.length == 0 || !userMap.includes(payload.id)) {
        return { data: { msg: `cannot delete doc with id=${payload.id} as you do not have access` } }
    }

    let idIndex = userMap.indexOf(payload.id);

    if(idIndex > -1){
        userMap.splice(idIndex, 1);
    }

    // update user mapping
    userDocMapping.insert(owner, userMap)

    const removedDoc = id2HashStorage.remove(payload.id);
    
    return match(removedDoc, {
        Some: (deletedHash) => {
            const doc = hash2DocStorage.remove(deletedHash);
            return response = { data: { doc: doc.Some?.name, hash: doc.Some?.hash, deleted: true } };
        },
        None: () => response = { data: { msg: `couldn't delete doc with id=${payload.id}. there is no such product.` } }
    });
}

$query;
export function http_request(req: HttpRequest): HttpResponse {
    /*
        Every HTTP request goes to `http_request` function even if it's
        a request that modifies the state - ["PUT", "POST", "DELETE"].
        In order to pass this request to `http_request_update` we need to 
        return an HttpResponse with the `upgrade` flag set to `true`.
        After this, `icx-proxy` will route this request to `http_request_update` 
        where one of the state-modifying requests should be handled properly.

    */
    if (["POST", "DELETE"].includes(req.method)) {
        return {
            status_code: 200,
            headers: [
                ["Content-type", "application/json"],
                ["Access-Control-Allow-Origin", "*"], 
                ["Access-Control-Allow-Methods", "POST, DELETE"],
                ["Access-Control-Allow-Headers", "Content-type"]
            ],
            body: new Uint8Array(),
            upgrade: Opt.Some(true)
        };
    }
    if (req.method !== "GET") {
        return buildHttpResponse(400, { msg: "invalid get method" });
    }

    return match(handleGetRequest(req.method, req.url), {
        Some: (handler) => {
            const result = handler.handle(handler.request);
            return buildHttpResponse(200, result);
        },
        None: () => {
            return buildHttpResponse(400, { msg: "get handler not found" });
        }
    });
}

function handleGetRequest(method: string, path: string): Opt<Handler> {
    if (new UrlPattern("/noOfDocs?canisterId=(:canister)").match(path)) {
        switch (method) {
            case "GET":
                return Opt.Some({
                    handle: getNoOfDocuments,
                    request: {}
                });
        }
    }else if (new UrlPattern("/your-documents/get-docs?canisterId=(:canister)&callerId=(:caller)").match(path)) {
        let match = new UrlPattern("/your-documents/get-docs?canisterId=(:canister)&callerId=(:caller)").match(path);
        switch (method) {
            case "GET":
                return Opt.Some({
                    handle: getUserDocs,
                    request: {
                        pathVariable: match
                    }
                });
        }
    } else if (new UrlPattern("/your-documents/view-doc?canisterId=(:canister)&callerId=(:caller)&documentId=(:id)").match(path)) {
        let match = new UrlPattern("/your-documents/view-doc?canisterId=(:canister)&callerId=(:caller)&documentId=(:id)").match(path);
        switch (method) {
            case "GET":
                return Opt.Some({
                    handle: viewDocument,
                    request: {
                        pathVariable: match
                    }
                });
        }
    }else if (new UrlPattern("/verify-document?canisterId=(:canister)&docHash=(:hash)").match(path)) {
        let match = new UrlPattern("/verify-document?canisterId=(:canister)&docHash=(:hash)").match(path);
        switch (method) {
            case "GET":
                return Opt.Some({
                    handle: verifyDocument,
                    request: {
                        pathVariable: match
                    }
                });
        }
    }
    return Opt.None;
}

$update;
export function http_request_update(req: HttpRequest): HttpResponse {
    if (["POST", "DELETE"].indexOf(req.method) === -1) {
        return buildHttpResponse(400, { msg: "invalid update method" });
    }
    return match(handleUpdateRequest(req.method, req.url, req.body), {
        Some: (handler) => {
            const result = handler.handle(handler.request);
            return buildHttpResponse(200, result);
        },
        None: () => {
            return buildHttpResponse(400, { msg: "update handler not found" });
        }
    })
}

function handleUpdateRequest(method: string, path: string, body: blob): Opt<Handler> {
    if (new UrlPattern("/submit-document?canisterId=(:canister)&callerId=(:caller)").match(path)) {
        const match = new UrlPattern("/submit-document?canisterId=(:canister)&callerId=(:caller)").match(path);
        switch (method) {
            case "POST":
                return Opt.Some({
                    handle: addDocument,
                    request: {
                        payload: JSON.parse(decodeUtf8(body)),
                        pathVariable: match,
                    }
                });
        }
    } 
   
    else if (new UrlPattern("/your-documents/delete-doc?canisterId=(:canister)&callerId=(:caller)&documentId=(:id)").match(path)) {
        const match = new UrlPattern("/your-documents/delete-doc?canisterId=(:canister)&callerId=(:caller)&documentId=(:id)").match(path);
        if (match) {
            switch (method) {
                case "DELETE":
                    return Opt.Some({
                        handle: deleteDocument,
                        request: {
                            pathVariable: match,
                        }
                    });
            }
        }
    }
    return Opt.None;
}

function buildHttpResponse(code: nat16, body: object): HttpResponse {
    const headers: Vec<[string, string]> = [
        ["Content-type", "application/json"],
        ["Access-Control-Allow-Origin", "*"],
        ["Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"],
        ["Access-Control-Allow-Headers", "Content-type"]
    ];
    return {
        status_code: code,
        headers,
        body: new Uint8Array(encodeUtf8(JSON.stringify(body))),
        upgrade: Opt.None
    };
}

function stringToBlob(string: string): blob {
    return new Uint8Array(encodeUtf8(string));
}