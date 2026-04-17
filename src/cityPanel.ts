import * as vscode from 'vscode';
import { SolutionAnalyzer, SolutionInfo, LanguageType, ClassCategory, CodeElement } from './solutionAnalyzer';

interface CityBuilding {
    id: string;
    type: ClassCategory;
    name: string;
    namespace: string;
    projectName: string;
    filePath: string;
    line: number;
    complexity: number;
    methodCount: number;
    height: number;
    width: number;
    depth: number;
    x: number;
    y: number;
    z: number;
    color: number;
}

const CATEGORY_COLORS: Record<ClassCategory, number> = {
    controller: 0xff6b6b,
    service: 0x4ecdc4,
    model: 0x45b7d1,
    repository: 0x96ceb4,
    interface: 0xa29bfe,
    helper: 0xfeca57,
    test: 0xfd79a8,
    component: 0x74b9ff,
    config: 0x00cec9,
    handler: 0xe17055,
    middleware: 0x636e72,
    factory: 0x2d3436,
    builder: 0x81ecec,
    adapter: 0x0984e3,
    observer: 0xd63031,
    strategy: 0x6c5ce7,
    other: 0xb2bec3
};

export class CityPanel {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private analyzer: SolutionAnalyzer;
    private currentSolution: SolutionInfo | null = null;
    private isOnFire: Map<string, boolean> = new Map();

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.analyzer = new SolutionAnalyzer();
    }

    async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside, true);
            await this.refresh();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'codeToCity',
            '[C2C] Code-to-City',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'ready') {
                await this.refresh();
            } else if (message.command === 'openFile') {
                await this.openFile(message.filePath, message.line);
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        await this.refresh();
    }

    async refreshSidebar(panel: vscode.WebviewPanel) {
        const solution = await this.analyzer.analyze();
        this.currentSolution = solution;
        
        if (solution) {
            solution.projects.forEach(p => this.isOnFire.set(p.name, false));
            panel.webview.html = this.getWebviewHtml();
            const cityData = this.prepareCityData(solution);
            panel.webview.postMessage({ command: 'cityData', data: cityData });
        } else {
            panel.webview.html = this.getEmptyStateHtml();
        }
    }

    async refreshSidebarView(view: vscode.WebviewView) {
        const solution = await this.analyzer.analyze();
        this.currentSolution = solution;
        
        if (solution) {
            solution.projects.forEach(p => this.isOnFire.set(p.name, false));
            view.webview.html = this.getWebviewHtml();
            const cityData = this.prepareCityData(solution);
            view.webview.postMessage({ command: 'cityData', data: cityData });
        } else {
            view.webview.html = this.getEmptyStateHtml();
        }
    }

    async openFile(filePath: string, line: number) {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
            
            const position = new vscode.Position(Math.max(0, line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (e) {
            vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
        }
    }

    async refresh() {
        if (!this.panel) { return; }

        const solution = await this.analyzer.analyze();
        this.currentSolution = solution;
        
        if (solution) {
            solution.projects.forEach(p => this.isOnFire.set(p.name, false));
            this.panel.webview.html = this.getWebviewHtml();
            
            const cityData = this.prepareCityData(solution);
            this.panel.webview.postMessage({ command: 'cityData', data: cityData });
        } else {
            this.panel.webview.html = this.getEmptyStateHtml();
        }
    }

    private prepareCityData(solution: SolutionInfo) {
        const buildings: CityBuilding[] = [];
        const bridges: Array<{from: {x: number, z: number}, to: {x: number, z: number}, color: number}> = [];
        
        let globalX = -60;
        const projectSpacing = 30;

        for (let pIndex = 0; pIndex < solution.projects.length; pIndex++) {
            const project = solution.projects[pIndex];
            const projectX = globalX;
            const namespaces = project.namespaces.sort((a, b) => a.name.localeCompare(b.name));
            let nsX = projectX - (namespaces.length - 1) * 6;

            for (const ns of namespaces) {
                const nsElements = ns.elements.sort((a, b) => a.name.localeCompare(b.name));
                const gridSize = Math.ceil(Math.sqrt(nsElements.length));
                
                for (let i = 0; i < nsElements.length; i++) {
                    const element = nsElements[i];
                    const baseHeight = 1 + element.methodCount * 0.25 + element.complexity * 0.15;
                    const buildingHeight = Math.min(baseHeight + 2, 10);
                    
                    buildings.push({
                        id: `${project.name}-${ns.name}-${element.name}`,
                        type: element.category,
                        name: element.name,
                        namespace: ns.name,
                        projectName: project.name,
                        filePath: element.filePath,
                        line: element.line,
                        complexity: element.complexity,
                        methodCount: element.methodCount,
                        height: buildingHeight,
                        width: 1.2 + element.complexity * 0.08,
                        depth: 1.2 + element.complexity * 0.08,
                        x: nsX + (i % gridSize) * 2.5,
                        y: 0,
                        z: Math.floor(i / gridSize) * 2.5,
                        color: CATEGORY_COLORS[element.category]
                    });
                }
                nsX += 12;
            }

            for (const dep of project.dependencies) {
                const depIndex = solution.projects.findIndex(p => 
                    p.name.includes(dep) || dep.includes(p.name) || p.name.toLowerCase() === dep.toLowerCase()
                );
                if (depIndex > pIndex) {
                    bridges.push({
                        from: { x: projectX, z: pIndex * 3 },
                        to: { x: globalX + depIndex * projectSpacing, z: depIndex * 3 },
                        color: 0x00d9ff
                    });
                }
            }
            globalX += projectSpacing;
        }

        const categoryCounts: Record<string, number> = {};
        for (const project of solution.projects) {
            for (const [cat, count] of Object.entries(project.categoryCounts)) {
                if (count > 0) categoryCounts[cat] = (categoryCounts[cat] || 0) + count;
            }
        }
        
        return {
            name: solution.name,
            buildings,
            bridges,
            languages: solution.languages,
            stats: {
                projects: solution.projects.length,
                namespaces: solution.projects.reduce((sum, p) => sum + p.namespaces.length, 0),
                elements: solution.projects.reduce((sum, p) => sum + p.elements.length, 0),
                complexity: solution.projects.reduce((sum, p) => sum + p.complexity, 0),
                ...categoryCounts
            },
            projectStats: solution.projects.map(p => ({
                name: p.name,
                language: p.language,
                elementCount: p.elements.length
            }))
        };
    }

    setBuildFailure(errors: Map<string, string[]>) {
        if (!this.panel || !this.currentSolution) { return; }
        const config = vscode.workspace.getConfiguration('codeToCity');
        const fireDuration = config.get<number>('fireDuration', 5000);

        for (const project of this.currentSolution.projects) {
            const projectErrors = errors.get(project.name) || [];
            if (projectErrors.length > 0) {
                this.isOnFire.set(project.name, true);
                vscode.window.showWarningMessage(`WARNING: ${project.name} has errors!`);
                this.panel.webview.postMessage({
                    command: 'setFire',
                    projectName: project.name
                });
                setTimeout(() => {
                    this.isOnFire.set(project.name, false);
                    this.panel?.webview.postMessage({
                        command: 'extinguishFire',
                        projectName: project.name
                    });
                }, fireDuration);
            }
        }
    }

    setBuildSuccess() {
        if (!this.panel) { return; }
        vscode.window.showInformationMessage('Build successful! City is at peace.');
        this.panel.webview.postMessage({ command: 'buildSuccess' });
    }

    extinguishFires() {
        if (!this.panel) { return; }
        this.isOnFire.forEach((_, key) => this.isOnFire.set(key, false));
        this.panel.webview.postMessage({ command: 'extinguishAllFires' });
        vscode.window.showInformationMessage('Firefighter: All fires extinguished!');
    }

    getEmptyStateHtml(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            margin: 0;
            background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%);
            font-family: 'Segoe UI', sans-serif;
            color: #fff;
        }
        .empty { text-align: center; max-width: 500px; }
        .empty h1 { color: #00d9ff; font-size: 2.5em; margin-bottom: 20px; }
        .empty p { color: #888; font-size: 1.1em; line-height: 1.6; }
        .langs { margin-top: 30px; display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; }
        .lang { padding: 10px 20px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="empty">
        <h1>[C2C] Code-to-City</h1>
        <p>Open a software project to visualize your code as a 3D city!</p>
        <div class="langs">
            <span class="lang">C#</span>
            <span class="lang">JS/TS</span>
            <span class="lang">Python</span>
            <span class="lang">Java</span>
            <span class="lang">Go</span>
            <span class="lang">Rust</span>
            <span class="lang">C++</span>
            <span class="lang">PHP</span>
        </div>
    </div>
</body>
</html>`;
    }

    getWebviewHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code-to-City</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            overflow: hidden; 
            font-family: 'Segoe UI', Tahoma, sans-serif;
            background: #050510;
        }
        #container { width: 100vw; height: 100vh; }
        
        #stats {
            position: absolute;
            top: 15px;
            left: 15px;
            background: rgba(10,10,30,0.9);
            color: #fff;
            padding: 12px 15px;
            border-radius: 10px;
            font-size: 11px;
            z-index: 100;
            border: 1px solid rgba(0,217,255,0.3);
            min-width: 160px;
        }
        #stats h1 { font-size: 14px; margin-bottom: 8px; color: #00d9ff; }
        #stats .stat { margin: 3px 0; display: flex; justify-content: space-between; }
        #stats .stat-value { color: #00d9ff; font-weight: bold; }
        
        #help {
            position: absolute;
            bottom: 15px;
            left: 15px;
            background: rgba(10,10,30,0.9);
            color: #888;
            padding: 10px 15px;
            border-radius: 10px;
            font-size: 10px;
            z-index: 100;
            border: 1px solid rgba(255,255,255,0.1);
        }
        #help b { color: #00d9ff; }
        
        #controls {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(10,10,30,0.9);
            padding: 10px;
            border-radius: 10px;
            z-index: 100;
            border: 1px solid rgba(255,255,255,0.1);
        }
        #controls button {
            display: block;
            width: 100%;
            margin: 4px 0;
            padding: 6px 12px;
            background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%);
            border: none;
            border-radius: 5px;
            cursor: pointer;
            color: #000;
            font-weight: bold;
            font-size: 11px;
        }
        #controls button:hover { opacity: 0.9; }
        
        #tooltip {
            position: absolute;
            background: rgba(0,0,0,0.95);
            color: #fff;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 11px;
            display: none;
            z-index: 200;
            border: 1px solid #00d9ff;
            max-width: 300px;
        }
        #tooltip strong { color: #00d9ff; display: block; margin-bottom: 4px; font-size: 13px; }
        #tooltip .hint { color: #888; font-size: 10px; margin-top: 6px; }
        #tooltip .info { margin: 2px 0; }
        
        #notification {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #ff3838;
            color: white;
            padding: 25px 40px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: bold;
            display: none;
            z-index: 200;
            text-align: center;
        }
        
        #loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #00d9ff;
            font-size: 14px;
            text-align: center;
        }
        .spinner {
            width: 35px;
            height: 35px;
            border: 3px solid rgba(0,217,255,0.2);
            border-top-color: #00d9ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 12px auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="container"></div>
    <div id="stats">
        <h1>[C2C] Code-to-City</h1>
        <div class="stat"><span>Projects</span><span class="stat-value" id="s-projects">-</span></div>
        <div class="stat"><span>Classes</span><span class="stat-value" id="s-elements">-</span></div>
        <div class="stat"><span>Complexity</span><span class="stat-value" id="s-complexity">-</span></div>
    </div>
    <div id="controls">
        <button onclick="resetCamera()">Reset</button>
        <button onclick="viewTop()">Top View</button>
        <button onclick="viewStreet()">Street</button>
    </div>
    <div id="help">
        <b>WASD</b> - Move | <b>Q/E</b> - Up/Down<br>
        <b>Mouse</b> - Look | <b>Click</b> - Go to Code
    </div>
    <div id="tooltip"></div>
    <div id="notification"></div>
    <div id="loading"><div class="spinner"></div>Building city...</div>

    <script src="https://unpkg.com/three@0.128.0/build/three.min.js"></script>
    <script>
        let scene, camera, renderer, cityGroup;
        let buildings = [];
        let buildingMap = new Map();
        let fires = new Map();
        let raycaster, mouse;
        let hoveredBuilding = null;
        let solutionData = null;
        
        let cameraTarget = new THREE.Vector3(0, 0, 0);
        let cameraDistance = 60;
        let cameraTheta = Math.PI / 4;
        let cameraPhi = Math.PI / 4;
        let isDragging = false;
        let previousMouse = { x: 0, y: 0 };
        let keys = {};
        let moveUp = false;
        let moveDown = false;

        const vscode = acquireVsCodeApi();

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'cityData') {
                solutionData = message.data;
                buildCity();
            } else if (message.command === 'setFire') {
                startFire(message.projectName);
            } else if (message.command === 'extinguishFire') {
                stopFire(message.projectName);
            } else if (message.command === 'extinguishAllFires') {
                stopAllFires();
            } else if (message.command === 'buildSuccess') {
                showNotification('Build Successful!', '#00d9ff');
            }
        });

        function init() {
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x050510, 100, 300);

            camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
            updateCameraPosition();

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x050510);
            document.getElementById('container').appendChild(renderer.domElement);

            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();

            scene.add(new THREE.AmbientLight(0x404060, 0.8));
            
            const sunLight = new THREE.DirectionalLight(0xffffff, 1);
            sunLight.position.set(100, 200, 100);
            scene.add(sunLight);

            cityGroup = new THREE.Group();
            scene.add(cityGroup);

            const ground = new THREE.Mesh(
                new THREE.PlaneGeometry(400, 400),
                new THREE.MeshLambertMaterial({ color: 0x080812 })
            );
            ground.rotation.x = -Math.PI / 2;
            cityGroup.add(ground);

            const grid = new THREE.GridHelper(400, 80, 0x00d9ff, 0x1a1a35);
            grid.material.opacity = 0.25;
            grid.material.transparent = true;
            cityGroup.add(grid);

            addStars();

            setupControls();
            window.addEventListener('resize', onResize);
            animate();

            vscode.postMessage({ command: 'ready' });
        }

        function addStars() {
            const positions = new Float32Array(4000 * 3);
            for (let i = 0; i < 4000; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 500;
                positions[i * 3 + 1] = Math.random() * 200 + 50;
                positions[i * 3 + 2] = (Math.random() - 0.5) * 500;
            }
            const stars = new THREE.Points(
                new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)),
                new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })
            );
            scene.add(stars);
        }

        function setupControls() {
            const canvas = renderer.domElement;
            
            canvas.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    const rect = canvas.getBoundingClientRect();
                    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                    
                    raycaster.setFromCamera(mouse, camera);
                    const intersects = raycaster.intersectObjects(buildings);
                    
                    if (intersects.length > 0) {
                        const building = intersects[0].object;
                        const data = building.userData;
                        vscode.postMessage({
                            command: 'openFile',
                            filePath: data.filePath,
                            line: data.line
                        });
                    } else {
                        isDragging = true;
                        previousMouse = { x: e.clientX, y: e.clientY };
                    }
                }
            });
            
            canvas.addEventListener('mouseup', () => { isDragging = false; });
            canvas.addEventListener('mouseleave', () => { isDragging = false; });
            
            canvas.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    const dx = e.clientX - previousMouse.x;
                    const dy = e.clientY - previousMouse.y;
                    cameraTheta -= dx * 0.01;
                    cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraPhi + dy * 0.01));
                    previousMouse = { x: e.clientX, y: e.clientY };
                }
                onMouseMove(e);
            });
            
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                cameraDistance = Math.max(20, Math.min(200, cameraDistance + e.deltaY * 0.1));
            }, { passive: false });
            
            canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });
            
            window.addEventListener('keydown', (e) => {
                keys[e.key.toLowerCase()] = true;
                if (e.key === ' ') moveUp = true;
                if (e.key === 'Shift') moveDown = true;
            });
            
            window.addEventListener('keyup', (e) => {
                keys[e.key.toLowerCase()] = false;
                if (e.key === ' ') moveUp = false;
                if (e.key === 'Shift') moveDown = false;
            });
        }

        function updateCameraPosition() {
            camera.position.x = cameraTarget.x + cameraDistance * Math.sin(cameraPhi) * Math.cos(cameraTheta);
            camera.position.y = cameraTarget.y + cameraDistance * Math.cos(cameraPhi);
            camera.position.z = cameraTarget.z + cameraDistance * Math.sin(cameraPhi) * Math.sin(cameraTheta);
            camera.lookAt(cameraTarget);
        }

        function buildCity() {
            document.getElementById('loading').style.display = 'block';
            
            buildings.forEach(b => cityGroup.remove(b));
            buildings = [];
            buildingMap.clear();

            if (!solutionData) {
                document.getElementById('loading').style.display = 'none';
                return;
            }

            document.getElementById('s-projects').textContent = solutionData.stats.projects;
            document.getElementById('s-elements').textContent = solutionData.stats.elements;
            document.getElementById('s-complexity').textContent = solutionData.stats.complexity;

            solutionData.buildings.forEach(b => createBuilding(b));
            solutionData.bridges.forEach(br => createBridge(br));

            if (solutionData.buildings.length > 0) {
                const centerX = solutionData.buildings.reduce((s, b) => s + b.x, 0) / solutionData.buildings.length;
                const centerZ = solutionData.buildings.reduce((s, b) => s + b.z, 0) / solutionData.buildings.length;
                cameraTarget.set(centerX, 5, centerZ);
                cameraDistance = Math.max(40, solutionData.buildings.length * 2);
            }

            document.getElementById('loading').style.display = 'none';
            updateCameraPosition();
        }

        function createBuilding(data) {
            const geometry = new THREE.BoxGeometry(data.width, data.height, data.depth);
            const material = new THREE.MeshLambertMaterial({ 
                color: data.color,
                emissive: data.color,
                emissiveIntensity: 0.15
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(data.x, data.height / 2, data.z);
            mesh.userData = { 
                name: data.name, 
                type: data.type, 
                methods: data.methodCount,
                namespace: data.namespace,
                projectName: data.projectName,
                filePath: data.filePath,
                line: data.line
            };
            
            buildings.push(mesh);
            buildingMap.set(data.id, mesh);
            cityGroup.add(mesh);
        }

        function createBridge(bridge) {
            const points = [
                new THREE.Vector3(bridge.from.x, 3, bridge.from.z),
                new THREE.Vector3(bridge.to.x, 3, bridge.to.z)
            ];
            const curve = new THREE.LineCurve3(points[0], points[1]);
            const tube = new THREE.Mesh(
                new THREE.TubeGeometry(curve, 8, 0.12, 6, false),
                new THREE.MeshBasicMaterial({ color: bridge.color, transparent: true, opacity: 0.5 })
            );
            cityGroup.add(tube);
        }

        function startFire(projectName) {
            buildings.forEach(b => {
                if (b.userData.projectName === projectName) {
                    const fireGeo = new THREE.ConeGeometry(0.3, 1.5, 6);
                    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.9 });
                    const fire = new THREE.Mesh(fireGeo, fireMat);
                    fire.position.set(b.position.x, b.geometry.parameters.height + 0.8, b.position.z);
                    fire.userData.baseY = b.geometry.parameters.height + 0.8;
                    fire.userData.building = b;
                    cityGroup.add(fire);
                    fires.set(projectName, fire);
                }
            });
            showNotification('BURNING: ' + projectName, '#ff3838');
        }

        function stopFire(projectName) {
            const fire = fires.get(projectName);
            if (fire) {
                cityGroup.remove(fire);
                fires.delete(projectName);
            }
        }

        function stopAllFires() {
            fires.forEach(fire => cityGroup.remove(fire));
            fires.clear();
        }

        function showNotification(text, color) {
            const n = document.getElementById('notification');
            n.textContent = text;
            n.style.background = color;
            n.style.display = 'block';
            setTimeout(() => { n.style.display = 'none'; }, 3000);
        }

        function animate() {
            requestAnimationFrame(animate);
            
            const time = Date.now() * 0.001;

            const moveSpeed = 0.5;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();
            
            const right = new THREE.Vector3();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
            
            if (keys['w'] || keys['arrowup']) cameraTarget.add(forward.clone().multiplyScalar(moveSpeed));
            if (keys['s'] || keys['arrowdown']) cameraTarget.add(forward.clone().multiplyScalar(-moveSpeed));
            if (keys['a'] || keys['arrowleft']) cameraTarget.add(right.clone().multiplyScalar(-moveSpeed));
            if (keys['d'] || keys['arrowright']) cameraTarget.add(right.clone().multiplyScalar(moveSpeed));
            if (moveUp) cameraTarget.y += moveSpeed;
            if (moveDown) cameraTarget.y = Math.max(0, cameraTarget.y - moveSpeed);

            updateCameraPosition();

            fires.forEach(fire => {
                fire.position.y = fire.userData.baseY + Math.sin(time * 6) * 0.2;
                fire.rotation.y = time * 3;
            });

            renderer.render(scene, camera);
        }

        function onMouseMove(e) {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(buildings);

            if (intersects.length > 0) {
                const obj = intersects[0].object;
                const tip = document.getElementById('tooltip');
                const fileName = obj.userData.filePath.split(/[/\\\\]/).pop();
                tip.innerHTML = '<strong>' + obj.userData.name + '</strong>' +
                    '<div class="info">Type: ' + obj.userData.type + '</div>' +
                    '<div class="info">Methods: ' + obj.userData.methods + '</div>' +
                    '<div class="info">File: ' + fileName + '</div>' +
                    '<div class="hint">[Click] Go to Code</div>';
                tip.style.left = (e.clientX + 15) + 'px';
                tip.style.top = (e.clientY + 15) + 'px';
                tip.style.display = 'block';
                renderer.domElement.style.cursor = 'pointer';
            } else {
                document.getElementById('tooltip').style.display = 'none';
                if (!isDragging) renderer.domElement.style.cursor = 'grab';
            }
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function resetCamera() {
            cameraTarget.set(0, 5, 0);
            cameraDistance = 60;
            cameraTheta = Math.PI / 4;
            cameraPhi = Math.PI / 4;
            updateCameraPosition();
        }

        function viewTop() {
            cameraTarget.set(0, 0, 0);
            cameraDistance = 80;
            cameraPhi = 0.01;
            updateCameraPosition();
        }

        function viewStreet() {
            cameraTarget.set(0, 2, 0);
            cameraDistance = 30;
            cameraPhi = Math.PI / 2 - 0.1;
            cameraTheta = 0;
            updateCameraPosition();
        }

        init();
    </script>
</body>
</html>`;
    }
}
