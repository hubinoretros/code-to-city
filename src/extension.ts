import * as vscode from 'vscode';
import { CityPanel } from './cityPanel';

const VERSION = '2.2.1';

export async function activate(context: vscode.ExtensionContext) {
    const cityPanel = new CityPanel(context);
    
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
    
    let buildFailureDisposable: vscode.Disposable | undefined;
    
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
                } else {
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
        const errors = new Map<string, string[]>();
        
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

function findProjectForFile(filePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return 'Unknown';
    
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

async function getBuildErrors(): Promise<Map<string, string[]>> {
    const errors = new Map<string, string[]>();
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return errors;
    
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

export function deactivate() {}
