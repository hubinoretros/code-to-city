"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const cityPanel_1 = require("./cityPanel");
const VERSION = '2.2.1';
async function activate(context) {
    const cityPanel = new cityPanel_1.CityPanel(context);
    vscode.window.showInformationMessage(`Code-to-City v${VERSION} activated!`);
    const openCommand = vscode.commands.registerCommand('code-to-city.open', async () => {
        await cityPanel.show();
    });
    const refreshCommand = vscode.commands.registerCommand('code-to-city.refresh', async () => {
        await cityPanel.refresh();
    });
    const firefighterCommand = vscode.commands.registerCommand('code-to-city.firefighter', async () => {
        cityPanel.extinguishFires();
    });
    let buildFailureDisposable;
    const setupBuildListener = () => {
        if (buildFailureDisposable) {
            buildFailureDisposable.dispose();
        }
        buildFailureDisposable = vscode.tasks.onDidEndTaskProcess(async (e) => {
            const taskName = e.execution.task.name.toLowerCase();
            if (taskName.includes('build') || taskName.includes('compile') ||
                taskName.includes('dotnet') || taskName.includes('npm build') ||
                taskName.includes('gradle') || taskName.includes('maven') ||
                taskName.includes('cargo') || taskName.includes('pip install')) {
                if (e.exitCode !== 0) {
                    const errorOutput = await getBuildErrors();
                    cityPanel.setBuildFailure(errorOutput);
                }
                else {
                    cityPanel.setBuildSuccess();
                }
            }
        });
    };
    setupBuildListener();
    vscode.window.onDidChangeWindowState((e) => {
        if (e.focused) {
            setupBuildListener();
        }
    });
    vscode.languages.onDidChangeDiagnostics((e) => {
        const errors = new Map();
        for (const uri of e.uris) {
            const diagnostics = vscode.languages.getDiagnostics(uri);
            const fileErrors = diagnostics
                .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                .map(d => `${vscode.workspace.asRelativePath(uri)}:${d.range.start.line}: ${d.message}`);
            if (fileErrors.length > 0) {
                const projectName = findProjectForFile(uri.fsPath);
                const existing = errors.get(projectName) || [];
                errors.set(projectName, [...existing, ...fileErrors]);
            }
        }
        if (errors.size > 0) {
            cityPanel.setBuildFailure(errors);
        }
    });
    context.subscriptions.push(openCommand, refreshCommand, firefighterCommand);
    if (buildFailureDisposable) {
        context.subscriptions.push(buildFailureDisposable);
    }
}
function findProjectForFile(filePath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return 'Unknown';
    for (const folder of workspaceFolders) {
        if (filePath.startsWith(folder.uri.fsPath)) {
            const relPath = vscode.workspace.asRelativePath(filePath);
            const parts = relPath.split(/[/\\]/);
            if (parts.length > 1) {
                return parts[0];
            }
            return folder.name;
        }
    }
    return vscode.workspace.asRelativePath(filePath).split(/[/\\]/)[0];
}
async function getBuildErrors() {
    const errors = new Map();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return errors;
    for (const folder of workspaceFolders) {
        const diagnostics = vscode.languages.getDiagnostics();
        for (const [uri, diags] of diagnostics) {
            if (uri.fsPath.startsWith(folder.uri.fsPath)) {
                const fileErrors = diags
                    .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
                    .map(d => `${vscode.workspace.asRelativePath(uri)}:${d.range.start.line + 1} - ${d.message}`);
                if (fileErrors.length > 0) {
                    const projectName = findProjectForFile(uri.fsPath);
                    const existing = errors.get(projectName) || [];
                    errors.set(projectName, [...existing, ...fileErrors.slice(0, 5)]);
                }
            }
        }
    }
    return errors;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map