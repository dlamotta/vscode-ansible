// Allows for executing a program with command-line arguments and reading the result
interface IExec {
    exec: (filename: string, cmdLineArgs: string[], handleResult: (ExecResult) => void) => void;
}

declare var require;

class ExecResult {
    public stdout = "";
    public stderr = "";
    public exitCode: number;
}

class NodeExec implements IExec {
    public exec(filename: string, cmdLineArgs: string[], handleResult: (ExecResult) => void) : void {
        var nodeExec = require('child_process').exec;

        var result = new ExecResult();
        result.exitCode = null;
        var cmdLine = filename + ' ' + cmdLineArgs.join(' ');
        var process = nodeExec(cmdLine, function(error, stdout, stderr) {
            result.stdout = stdout;
            result.stderr = stderr;
            result.exitCode = error ? error.code : 0;
            handleResult(result);
        });
    }
}