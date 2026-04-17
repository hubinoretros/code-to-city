import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type LanguageType = 'csharp' | 'javascript' | 'typescript' | 'python' | 'java' | 'go' | 'rust' | 'cpp' | 'ruby' | 'php' | 'swift' | 'kotlin' | 'scala' | 'other';
export type ClassCategory = 'controller' | 'service' | 'model' | 'repository' | 'interface' | 'helper' | 'test' | 'component' | 'config' | 'handler' | 'middleware' | 'factory' | 'builder' | 'adapter' | 'observer' | 'strategy' | 'other';

export interface CodeElement {
    name: string;
    type: 'class' | 'function' | 'interface' | 'struct' | 'enum' | 'trait' | 'module' | 'component';
    category: ClassCategory;
    language: LanguageType;
    namespace: string;
    projectName: string;
    filePath: string;
    line: number;
    complexity: number;
    lineCount: number;
    methodCount: number;
    dependencies: string[];
}

export interface NamespaceModule {
    name: string;
    projectName: string;
    elements: CodeElement[];
    categoryCounts: Record<ClassCategory, number>;
}

export interface ProjectInfo {
    name: string;
    path: string;
    language: LanguageType;
    elements: CodeElement[];
    namespaces: NamespaceModule[];
    categoryCounts: Record<ClassCategory, number>;
    dependencies: string[];
    complexity: number;
}

export interface SolutionInfo {
    name: string;
    path: string;
    projects: ProjectInfo[];
    languages: LanguageType[];
}

const LANGUAGE_EXTENSIONS: Record<string, LanguageType> = {
    '.cs': 'csharp',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'cpp',
    '.h': 'cpp',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.vue': 'javascript',
    '.svelte': 'javascript'
};

const CATEGORY_PATTERNS: Record<ClassCategory, RegExp[]> = {
    controller: [/controller/i, /api/i, /endpoint/i, /router/i, /route/i],
    service: [/service/i, /handler/i, /manager/i, /executor/i, /worker/i],
    model: [/model/i, /entity/i, /dto/i, /vo/i, /viewmodel/i, /request/i, /response/i, /payload/i],
    repository: [/repository/i, /dao/i, /data/i, /store/i, /persistence/i, /mapper/i],
    interface: [/interface/i, /^i[a-z][a-z0-9]/i],
    helper: [/helper/i, /util/i, /tool/i, /common/i, /shared/i, /extension/i],
    test: [/test/i, /spec/i, /mock/i, /fixture/i, /assert/i],
    component: [/component/i, /widget/i, /view/i, /page/i, /screen/i, /container/i],
    config: [/config/i, /settings/i, /options/i, /properties/i, /env/i, /\.config\./i],
    handler: [/handler/i, /listener/i, /callback/i, /subscriber/i, /reactor/i],
    middleware: [/middleware/i, /filter/i, /interceptor/i, /decorator/i, /wrapper/i],
    factory: [/factory/i, /creator/i, /provider/i, /generator/i],
    builder: [/builder/i, /construct/i],
    adapter: [/adapter/i, /bridge/i, /facade/i, /proxy/i, /gateway/i],
    observer: [/observer/i, /publisher/i, /emitter/i, /mediator/i, /event/i],
    strategy: [/strategy/i, /policy/i, /rule/i, /validator/i, /evaluator/i],
    other: []
};

export class SolutionAnalyzer {
    async analyze(): Promise<SolutionInfo | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showInformationMessage('Code-to-City: Lütfen bir workspace açın');
            return null;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const projectFolders = await this.findProjectFolders(rootPath);

        if (projectFolders.length === 0) {
            const singleProject = await this.analyzeSingleProject(rootPath, this.detectLanguage(rootPath));
            if (singleProject && singleProject.elements.length > 0) {
                return {
                    name: path.basename(rootPath),
                    path: rootPath,
                    projects: [singleProject],
                    languages: [singleProject.language]
                };
            }
            vscode.window.showInformationMessage('Code-to-City: Desteklenen bir proje bulunamadı');
            return null;
        }

        const projects: ProjectInfo[] = [];
        const languagesSet = new Set<LanguageType>();

        for (const folder of projectFolders) {
            const project = await this.analyzeSingleProject(folder.path, folder.language);
            if (project) {
                projects.push(project);
                languagesSet.add(project.language);
            }
        }

        if (projects.length === 0) {
            vscode.window.showInformationMessage('Code-to-City: Kod analiz edilemedi');
            return null;
        }

        return {
            name: path.basename(rootPath),
            path: rootPath,
            projects,
            languages: Array.from(languagesSet)
        };
    }

    private async findProjectFolders(rootPath: string): Promise<Array<{path: string, language: LanguageType}>> {
        const folders: Array<{path: string, language: LanguageType}> = [];
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(rootPath));
            
            for (const [name, type] of entries) {
                if (type !== vscode.FileType.Directory) continue;
                if (name.startsWith('.') || name === 'node_modules' || name === 'bin' || name === 'obj' || name === 'dist' || name === 'build') continue;
                
                const fullPath = path.join(rootPath, name);
                const language = this.detectLanguage(fullPath);
                
                if (language !== 'other') {
                    folders.push({ path: fullPath, language });
                }
            }
        } catch (e) {
            console.error('Error reading directory:', e);
        }
        
        return folders;
    }

    private detectLanguage(folderPath: string): LanguageType {
        const langCounts: Record<string, number> = {};
        
        try {
            const scanDir = (dir: string, depth: number = 0) => {
                if (depth > 3) return;
                
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue;
                    
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        if (!['node_modules', 'bin', 'obj', 'dist', 'build', 'target', '__pycache__', '.git'].includes(entry.name)) {
                            scanDir(fullPath, depth + 1);
                        }
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        const lang = LANGUAGE_EXTENSIONS[ext];
                        if (lang) {
                            langCounts[lang] = (langCounts[lang] || 0) + 1;
                        }
                    }
                }
            };
            
            scanDir(folderPath);
        } catch (e) {}

        let maxCount = 0;
        let dominantLang: LanguageType = 'other';
        
        for (const [lang, count] of Object.entries(langCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantLang = lang as LanguageType;
            }
        }
        
        return dominantLang;
    }

    private async analyzeSingleProject(projectPath: string, language: LanguageType): Promise<ProjectInfo | null> {
        const patterns = this.getFilePatterns(language);
        let elements: CodeElement[] = [];
        
        for (const ext of patterns) {
            try {
                const pattern = new vscode.RelativePattern(projectPath, `**/*${ext}`);
                const files = await vscode.workspace.findFiles(pattern, this.getExclusionPattern(language), 1000);
                
                for (const file of files) {
                    const fileElements = await this.analyzeFile(file, language, path.basename(projectPath));
                    elements.push(...fileElements);
                }
            } catch (e) {
                console.error('Error scanning files:', e);
            }
        }

        if (elements.length === 0) return null;

        const namespaces = this.groupByNamespace(elements, path.basename(projectPath));
        const dependencies = await this.findDependencies(projectPath, language);
        const complexity = elements.reduce((sum, e) => sum + e.complexity, 0);

        return {
            name: path.basename(projectPath),
            path: projectPath,
            language,
            elements,
            namespaces,
            categoryCounts: this.getCategoryCounts(elements),
            dependencies,
            complexity
        };
    }

    private getFilePatterns(language: LanguageType): string[] {
        switch (language) {
            case 'csharp': return ['.cs'];
            case 'javascript': return ['.js', '.jsx', '.vue', '.svelte'];
            case 'typescript': return ['.ts', '.tsx'];
            case 'python': return ['.py'];
            case 'java': return ['.java'];
            case 'go': return ['.go'];
            case 'rust': return ['.rs'];
            case 'cpp': return ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'];
            case 'ruby': return ['.rb'];
            case 'php': return ['.php'];
            case 'swift': return ['.swift'];
            case 'kotlin': return ['.kt', '.kts'];
            case 'scala': return ['.scala'];
            default: return [];
        }
    }

    private getExclusionPattern(language: LanguageType): string {
        switch (language) {
            case 'javascript':
            case 'typescript':
                return '**/node_modules/**,**/dist/**,**/build/**,**/.next/**';
            case 'python':
                return '**/__pycache__/**,**/venv/**,**/.venv/**,**/env/**';
            case 'rust':
                return '**/target/**';
            case 'java':
                return '**/target/**,**/build/**';
            default:
                return '**/node_modules/**,**/bin/**,**/obj/**,**/dist/**';
        }
    }

    private async analyzeFile(file: vscode.Uri, language: LanguageType, projectName: string): Promise<CodeElement[]> {
        const elements: CodeElement[] = [];
        
        try {
            const content = await fs.promises.readFile(file.fsPath, 'utf-8');
            const lines = content.split('\n');
            
            const namespace = this.extractNamespace(file.fsPath, language);
            const lineCount = lines.length;
            const complexity = this.calculateComplexity(content);
            const methodCount = this.countMethods(content, language);
            
            const patterns = this.getElementPatterns(language);
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                for (const pattern of patterns) {
                    const match = line.match(pattern.regex);
                    if (match && this.isValidMatch(line, match)) {
                        const name = match[pattern.nameIndex || 1];
                        const type = pattern.type;
                        
                        if (this.isValidElementName(name)) {
                            elements.push({
                                name,
                                type,
                                category: this.categorizeElement(name, type, namespace, language),
                                language,
                                namespace,
                                projectName,
                                filePath: file.fsPath,
                                line: i + 1,
                                complexity: Math.max(1, Math.floor(complexity / (elements.length + 1))),
                                lineCount: this.estimateElementLines(lines, i),
                                methodCount: this.countMethodsInElement(lines.slice(i), language),
                                dependencies: this.extractDependencies(lines.slice(i), language)
                            });
                            break;
                        }
                    }
                }
            }
        } catch (e) {}
        
        return elements;
    }

    private getElementPatterns(language: LanguageType): Array<{regex: RegExp, type: CodeElement['type'], nameIndex?: number}> {
        switch (language) {
            case 'csharp':
                return [
                    { regex: /^\s*(?:public|private|protected|internal)?\s*(?:abstract|sealed|static)?\s*class\s+(\w+)/, type: 'class' },
                    { regex: /^\s*(?:public|private|protected|internal)?\s*interface\s+(\w+)/, type: 'interface' },
                    { regex: /^\s*(?:public|private|protected|internal)?\s*struct\s+(\w+)/, type: 'struct' },
                    { regex: /^\s*enum\s+(\w+)/, type: 'enum' },
                    { regex: /^\s*(?:public|private|protected|internal)?\s*(?:abstract)?\s*record\s+(\w+)/, type: 'class' }
                ];
            case 'javascript':
            case 'typescript':
                return [
                    { regex: /\bclass\s+(\w+)/, type: 'class' },
                    { regex: /\bfunction\s+(\w+)/, type: 'function' },
                    { regex: /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/u, type: 'function', nameIndex: 1 },
                    { regex: /\b(?:export|default)?\s*(?:const|let|var)\s+(\w+)\s*=/, type: 'function', nameIndex: 1 },
                    { regex: /interface\s+(\w+)/, type: 'interface' },
                    { regex: /type\s+(\w+)\s*=/, type: 'interface', nameIndex: 1 }
                ];
            case 'python':
                return [
                    { regex: /^class\s+(\w+)/, type: 'class' },
                    { regex: /^def\s+(\w+)/, type: 'function' }
                ];
            case 'java':
                return [
                    { regex: /(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/, type: 'class' },
                    { regex: /(?:public|private|protected)?\s*interface\s+(\w+)/, type: 'interface' },
                    { regex: /(?:public|private|protected)?\s*enum\s+(\w+)/, type: 'enum' }
                ];
            case 'go':
                return [
                    { regex: /^type\s+(\w+)\s+(?:struct|interface|func)/, type: 'struct' },
                    { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)/, type: 'function' }
                ];
            case 'rust':
                return [
                    { regex: /\b(?:pub\s+)?(?:struct|enum|type)\s+(\w+)/, type: 'struct' },
                    { regex: /\bfn\s+(\w+)/, type: 'function' },
                    { regex: /\btrait\s+(\w+)/, type: 'interface' }
                ];
            case 'cpp':
                return [
                    { regex: /\bclass\s+(\w+)/, type: 'class' },
                    { regex: /\bstruct\s+(\w+)/, type: 'struct' },
                    { regex: /\benum\s+(?:class\s+)?(\w+)/, type: 'enum' }
                ];
            case 'ruby':
                return [
                    { regex: /\bclass\s+(\w+)/, type: 'class' },
                    { regex: /\bmodule\s+(\w+)/, type: 'module' },
                    { regex: /\bdef\s+(\w+)/, type: 'function' }
                ];
            case 'php':
                return [
                    { regex: /^\s*class\s+(\w+)/, type: 'class' },
                    { regex: /^\s*interface\s+(\w+)/, type: 'interface' },
                    { regex: /\bfunction\s+(\w+)/, type: 'function' }
                ];
            case 'swift':
                return [
                    { regex: /\bclass\s+(\w+)/, type: 'class' },
                    { regex: /\bstruct\s+(\w+)/, type: 'struct' },
                    { regex: /\bprotocol\s+(\w+)/, type: 'interface' },
                    { regex: /\bfunc\s+(\w+)/, type: 'function' }
                ];
            case 'kotlin':
                return [
                    { regex: /\b(?:class|data class|enum class|sealed class)\s+(\w+)/, type: 'class' },
                    { regex: /\binterface\s+(\w+)/, type: 'interface' },
                    { regex: /\bfun\s+(\w+)/, type: 'function' }
                ];
            case 'scala':
                return [
                    { regex: /\bclass\s+(\w+)/, type: 'class' },
                    { regex: /\btrait\s+(\w+)/, type: 'interface' },
                    { regex: /\bobject\s+(\w+)/, type: 'class' },
                    { regex: /\bdef\s+(\w+)/, type: 'function' }
                ];
            default:
                return [];
        }
    }

    private extractNamespace(filePath: string, language: LanguageType): string {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            
            switch (language) {
                case 'csharp':
                    for (const line of lines) {
                        const match = line.match(/^namespace\s+([A-Za-z0-9_.]+)/);
                        if (match) return match[1];
                    }
                    break;
                case 'javascript':
                case 'typescript':
                    for (const line of lines) {
                        const match = line.match(/@namespace\s+(\S+)/);
                        if (match) return match[1];
                    }
                    return path.dirname(filePath).split(/[\\/]/).pop() || 'Global';
                case 'python':
                    for (const line of lines) {
                        const match = line.match(/^(?:class|def)\s+(\w+)/);
                        if (match) {
                            const dir = path.dirname(filePath);
                            if (path.basename(dir) !== 'src' && path.basename(dir) !== 'app') {
                                return path.basename(dir);
                            }
                            return path.dirname(dir).split(/[\\/]/).pop() || 'root';
                        }
                    }
                    return path.basename(filePath, path.extname(filePath));
                case 'java':
                    for (const line of lines) {
                        const match = line.match(/^package\s+([A-Za-z0-9_.]+)/);
                        if (match) return match[1];
                    }
                    break;
                case 'go':
                    for (const line of lines) {
                        const match = line.match(/^package\s+(\w+)/);
                        if (match) return match[1];
                    }
                    break;
                case 'ruby':
                    for (const line of lines) {
                        const match = line.match(/^module\s+(\w+)/);
                        if (match) return match[1];
                    }
                    return path.basename(filePath, '.rb');
            }
        } catch (e) {}
        
        return 'Global';
    }

    private calculateComplexity(content: string): number {
        let complexity = 1;
        complexity += (content.match(/\bif\b/g) || []).length;
        complexity += (content.match(/\bfor\b/g) || []).length;
        complexity += (content.match(/\bwhile\b/g) || []).length;
        complexity += (content.match(/\bswitch\b/g) || []).length;
        complexity += (content.match(/\bcatch\b/g) || []).length;
        complexity += (content.match(/\?\s*[^:]+\s*:/g) || []).length;
        return Math.max(1, complexity);
    }

    private countMethods(content: string, language: LanguageType): number {
        switch (language) {
            case 'csharp':
                return (content.match(/(?:public|private|protected|internal)\s+(?:async\s+)?[\w<>\[\],\s]+\s+\w+\s*\(/g) || []).length;
            case 'javascript':
            case 'typescript':
                return (content.match(/(?:\b\w+\s*\([^)]*\)\s*\{)/g) || []).length;
            case 'python':
                return (content.match(/^\s*def\s+\w+/gm) || []).length;
            case 'java':
                return (content.match(/(?:public|private|protected)\s+[\w<>\[\]]+\s+\w+\s*\(/g) || []).length;
            case 'go':
                return (content.match(/\bfunc\s+(?:\([^)]+\)\s+)?\w+/g) || []).length;
            case 'rust':
                return (content.match(/\bfn\s+\w+/g) || []).length;
            default:
                return 1;
        }
    }

    private countMethodsInElement(lines: string[], language: LanguageType): number {
        const content = lines.slice(0, 50).join('\n');
        return this.countMethods(content, language);
    }

    private estimateElementLines(lines: string[], startIndex: number): number {
        let braceCount = 0;
        let started = false;
        let count = 0;
        
        for (let i = startIndex; i < Math.min(startIndex + 200, lines.length); i++) {
            const line = lines[i];
            count++;
            
            for (const char of line) {
                if (char === '{') { braceCount++; started = true; }
                else if (char === '}') { braceCount--; }
            }
            
            if (started && braceCount <= 0) break;
        }
        
        return count;
    }

    private extractDependencies(lines: string[], language: LanguageType): string[] {
        const deps: string[] = [];
        const content = lines.join('\n');
        
        switch (language) {
            case 'csharp':
                const usingMatch = content.match(/using\s+([A-Za-z0-9_.]+)/g);
                if (usingMatch) deps.push(...usingMatch.map(u => u.replace('using ', '')));
                break;
            case 'javascript':
            case 'typescript':
                const importMatch = content.match(/import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g);
                if (importMatch) deps.push(...importMatch.map(i => i.replace(/import\s+(?:.*?\s+from\s+)?['"]|['"]/g, '')));
                const requireMatch = content.match(/require\(['"]([^'"]+)['"]\)/g);
                if (requireMatch) deps.push(...requireMatch.map(r => r.replace(/require\(['"]|['"]\)/g, '')));
                break;
            case 'python':
                const importRe = content.match(/^(?:from\s+[\w.]+\s+)?import\s+([\w, ]+)/gm);
                if (importRe) deps.push(...importRe.map(i => i.replace(/^(?:from\s+[\w.]+\s+)?import\s+/, '').trim()));
                break;
            case 'java':
                const importJa = content.match(/import\s+([A-Za-z0-9_.]+)/g);
                if (importJa) deps.push(...importJa.map(i => i.replace('import ', '')));
                break;
            case 'go':
                const goImport = content.match(/"[^"]+"/g);
                if (goImport) deps.push(...goImport.map(i => i.replace(/"/g, '')));
                break;
        }
        
        return [...new Set(deps)];
    }

    private isValidMatch(line: string, match: RegExpMatchArray): boolean {
        const name = match[1];
        if (!name || name.length < 2) return false;
        if (name.startsWith('_')) return false;
        if (name.match(/^\d/)) return false;
        if (line.includes('//') || line.includes('#')) {
            const commentIndex = line.indexOf('//') !== -1 ? line.indexOf('//') : line.indexOf('#');
            if (match.index !== undefined && match.index >= commentIndex) return false;
        }
        return true;
    }

    private isValidElementName(name: string): boolean {
        if (!name || name.length < 2) return false;
        if (name.startsWith('<') || name.startsWith('_')) return false;
        if (name.match(/^\d/)) return false;
        if (['ControllerBase', 'Component', 'Module', 'App'].includes(name)) return true;
        return true;
    }

    private categorizeElement(name: string, type: CodeElement['type'], namespace: string, language: LanguageType): ClassCategory {
        const lowerName = name.toLowerCase();
        const lowerNamespace = namespace.toLowerCase();
        
        if (type === 'interface' || type === 'trait') {
            return 'interface';
        }
        
        for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
            if (category === 'other') continue;
            for (const pattern of patterns) {
                if (pattern.test(name) || pattern.test(namespace)) {
                    return category as ClassCategory;
                }
            }
        }
        
        if (type === 'function') {
            return 'service';
        }
        
        return 'other';
    }

    private groupByNamespace(elements: CodeElement[], projectName: string): NamespaceModule[] {
        const namespaceMap = new Map<string, NamespaceModule>();
        
        for (const element of elements) {
            if (!namespaceMap.has(element.namespace)) {
                namespaceMap.set(element.namespace, {
                    name: element.namespace,
                    projectName,
                    elements: [],
                    categoryCounts: this.getEmptyCategoryCounts()
                });
            }
            const ns = namespaceMap.get(element.namespace)!;
            ns.elements.push(element);
            ns.categoryCounts[element.category]++;
        }
        
        return Array.from(namespaceMap.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
        );
    }

    private getCategoryCounts(elements: CodeElement[]): Record<ClassCategory, number> {
        const counts = this.getEmptyCategoryCounts();
        for (const element of elements) {
            counts[element.category]++;
        }
        return counts;
    }

    private getEmptyCategoryCounts(): Record<ClassCategory, number> {
        return {
            controller: 0, service: 0, model: 0, repository: 0,
            interface: 0, helper: 0, test: 0, component: 0,
            config: 0, handler: 0, middleware: 0, factory: 0,
            builder: 0, adapter: 0, observer: 0, strategy: 0, other: 0
        };
    }

    private async findDependencies(projectPath: string, language: LanguageType): Promise<string[]> {
        const deps: string[] = [];
        
        switch (language) {
            case 'csharp':
                try {
                    const csprojFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, '*.csproj'), '', 1
                    );
                    for (const csproj of csprojFiles) {
                        const content = fs.readFileSync(csproj.fsPath, 'utf-8');
                        const matches = content.match(/ProjectReference\s+Include="([^"]+)"/g) || [];
                        deps.push(...matches.map(m => m.match(/Include="([^"]+)"/)?.[1] || '').filter(Boolean));
                        const packageMatches = content.match(/PackageReference\s+Include="([^"]+)"/g) || [];
                        deps.push(...packageMatches.map(m => m.match(/Include="([^"]+)"/)?.[1] || '').filter(Boolean));
                    }
                } catch (e) {}
                break;
            case 'javascript':
            case 'typescript':
                try {
                    const pkgFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, 'package.json'), '', 1
                    );
                    for (const pkg of pkgFiles) {
                        const content = fs.readFileSync(pkg.fsPath, 'utf-8');
                        const pkgJson = JSON.parse(content);
                        deps.push(...Object.keys(pkgJson.dependencies || {}));
                        deps.push(...Object.keys(pkgJson.devDependencies || {}));
                    }
                } catch (e) {}
                break;
            case 'python':
                try {
                    const reqFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, '{requirements.txt,pyproject.toml,setup.py}'), '', 10
                    );
                    for (const req of reqFiles) {
                        const content = fs.readFileSync(req.fsPath, 'utf-8');
                        const matches = content.match(/^[\w\-]+/gm) || [];
                        deps.push(...matches);
                    }
                } catch (e) {}
                break;
            case 'java':
                try {
                    const pomFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, '{pom.xml,build.gradle}'), '', 1
                    );
                    for (const pom of pomFiles) {
                        const content = fs.readFileSync(pom.fsPath, 'utf-8');
                        const matches = content.match(/<dependency>[^]*?<groupId>([^<]+)[^]*?<artifactId>([^<]+)/g) || [];
                        deps.push(...matches.map(m => m.replace(/<[^>]+>/g, '')));
                    }
                } catch (e) {}
                break;
            case 'go':
                try {
                    const goModFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, 'go.mod'), '', 1
                    );
                    for (const goMod of goModFiles) {
                        const content = fs.readFileSync(goMod.fsPath, 'utf-8');
                        const matches = content.match(/^    ([^\s]+)/gm) || [];
                        deps.push(...matches.map(m => m.trim()));
                    }
                } catch (e) {}
                break;
            case 'rust':
                try {
                    const cargoFiles = await vscode.workspace.findFiles(
                        new vscode.RelativePattern(projectPath, 'Cargo.toml'), '', 1
                    );
                    for (const cargo of cargoFiles) {
                        const content = fs.readFileSync(cargo.fsPath, 'utf-8');
                        const matches = content.match(/\bname\s*=\s*"([^"]+)"/g) || [];
                        deps.push(...matches.map(m => m.match(/"([^"]+)"/)?.[1] || '').filter(Boolean));
                    }
                } catch (e) {}
                break;
        }
        
        return [...new Set(deps)];
    }
}
