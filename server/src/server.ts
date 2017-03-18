/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, TextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentPositionParams,
	CompletionItem, CompletionItemKind
} from 'vscode-languageserver';
import {NodeExec, IExec, ExecResult} from './exec';

const WARNING = "[WARNING] ";
const ERROR = "ERROR! "

// Create the external command executioner
let cli: IExec = new NodeExec();

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// diagnostics used to send back to the client
let diagnostics: Diagnostic[] = [];	

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites. 
let workspaceRoot: string;
connection.onInitialize((params): InitializeResult => {
	connection.console.log('Initializing Ansible Language Server');
	
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
			}
		}
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

// The settings interface describe the server relevant settings part
interface Settings {
	ansibleLanguageServer: AnsibleSettings;
}

// These are the settings we defined in the client's package.json file
interface AnsibleSettings {
	maxNumberOfProblems: number;
}

// hold the maxNumberOfProblems setting
let maxNumberOfProblems: number;
// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.ansibleLanguageServer.maxNumberOfProblems || 100;
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});

function handler(result: ExecResult): void {
	let problems = 0;
	let lines = result.stderr.split(/\r?\n/g);
	let sev: DiagnosticSeverity;	

	// clean up whatever we had before
	diagnostics = [];
	
	for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
		let line = lines[i].trim();
		let msg = "";

		// need lots more work here but this is a first pass to see how things work
		if (line.startsWith(WARNING)) {
			sev = DiagnosticSeverity.Warning;
			msg = line.substring(WARNING.length);
		}
		else if (line.startsWith(ERROR)) {
			sev = DiagnosticSeverity.Error;
			msg = line.substring(ERROR.length);
		}
		else {
			sev = null;
		}		

		if (sev != null) {
			problems++;
			diagnostics.push({
				severity: sev,
				range: {
					start: { line: i, character: Number.MAX_VALUE },
					end: { line: i, character: Number.MAX_VALUE }
				},
				message: msg,
				source: 'ex'
			});
		}
	}
}

function validateTextDocument(playbook: TextDocument): void {
	let playbookUri :string = playbook.uri;
	if(!playbook.uri.startsWith("file:")){//only file system URIs are supported.
		return;
	}

	// we want to do the syntax check on the host where we are editing playbooks (i.e., localhost)
	let args: string[] = [ "-i", "\"localhost,\"", "-c", "local", "--syntax-check", playbookUri.slice(7) ];
	connection.console.log(playbookUri.slice(7));
	cli.exec("ansible-playbook", args, handler);

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: playbookUri, diagnostics });
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have change in VSCode
	connection.console.log('We recevied a file change event');
});


// This handler provides the initial list of the completion items.
connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in 
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2
		}
	]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details',
		item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
		item.documentation = 'JavaScript documentation'
	}
	return item;
});

/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});

connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Listen on the connection
connection.listen();