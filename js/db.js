// PINEA Slides V2 — Dexie Database
const db = new Dexie('PineaSlidesV4');
db.version(1).stores({
    groups:   'id++, name, sortOrder',
    slides:   'id++, groupId, sortOrder',
    config:   'id',
    layouts:  'tvId'
});
db.version(2).stores({
    groups:   'id++, name, sortOrder',
    slides:   'id++, groupId, sortOrder, tvAssignment',
    config:   'id',
    layouts:  'tvId'
}).upgrade(async tx => {
    await tx.table('slides').toCollection().modify(s => {
        if (!s.tvAssignment) s.tvAssignment = 'both';
    });
});
db.version(3).stores({
    groups:   'id++, name, sortOrder',
    slides:   'id++, groupId, sortOrder, tvAssignment',
    config:   'id',
    layouts:  'tvId'
}).upgrade(async tx => {
    await tx.table('layouts').toCollection().modify(layout => {
        const rows = layout.rows || 3;
        const oldMode = layout.rowAnimationMode || 'cell';
        const oldStep = layout.step || 1;
        
        // Migrate single values → per-row arrays
        if (!layout.rowAnimationModes || !Array.isArray(layout.rowAnimationModes)) {
            layout.rowAnimationModes = Array.from({length: rows}, () => oldMode);
        }
        if (!layout.rowSteps || !Array.isArray(layout.rowSteps)) {
            layout.rowSteps = Array.from({length: rows}, () => oldStep);
        }
        if (!layout.stripSteps || !Array.isArray(layout.stripSteps)) {
            layout.stripSteps = Array.from({length: rows}, () => 1);
        }
        if (!layout.rowOffsets || !Array.isArray(layout.rowOffsets)) {
            layout.rowOffsets = Array.from({length: rows}, (_, i) => i * 2000);
        }
        
        // Ensure arrays match current row count
        while (layout.rowAnimationModes.length < rows) layout.rowAnimationModes.push(oldMode);
        while (layout.rowSteps.length < rows) layout.rowSteps.push(oldStep);
        while (layout.stripSteps.length < rows) layout.stripSteps.push(1);
        while (layout.rowOffsets.length < rows) layout.rowOffsets.push((layout.rowOffsets.length || 0) * 2000);
        
        layout.rowAnimationModes.length = rows;
        layout.rowSteps.length = rows;
        layout.stripSteps.length = rows;
        layout.rowOffsets.length = rows;
        
        // Cleanup old flat fields (optional, keep for backward compat)
        // delete layout.rowAnimationMode;
        // delete layout.step;
    });
});

db.version(4).stores({
    groups:   'id++, name, sortOrder',
    slides:   'id++, groupId, sortOrder, tvAssignment',
    config:   'id',
    layouts:  'tvId'
}).upgrade(async tx => {
    await tx.table('layouts').toCollection().modify(layout => {
        const rows = layout.rows || 3;
        const oldGap = layout.cellGap || 4;
        
        if (!layout.rowCellGaps || !Array.isArray(layout.rowCellGaps)) {
            layout.rowCellGaps = Array.from({length: rows}, () => oldGap);
        }
        while (layout.rowCellGaps.length < rows) layout.rowCellGaps.push(oldGap);
        layout.rowCellGaps.length = rows;
    });
});

const DEFAULT_CONFIG = {
    id:              'global',
    gridColor:       '#ff3366',
    gridVisible:     false,
    gridOpacity:     0.4,
    gridWidthPx:     1,
    gridSize:        '25%',
    gridCols:        2,
    gridRows:        2,
    cropMode:        'cover',
    transitionType:  'fade',
    transitionSettings: { duration: 1200, easing: 'ease-in-out' },
    showGroupLabel:  true,
    groupLabelPos:   'bottom',
    labelColor:      '#ffffff',
    labelBgOpacity:  0.6,
    debugOverlay:    false,
    autoStart:       true,
    idleTimeout:     0
};

async function initDB() {
    await db.open();
    if (!(await db.config.get('global'))) {
        await db.config.add(DEFAULT_CONFIG);
    }
    if (await db.groups.count() === 0) {
        await db.groups.bulkAdd([
            { name:'Allgemein', color:'#00aaff', sortOrder:0 },
            { name:'Programm',  color:'#ffaa00', sortOrder:1 },
            { name:'Specials',  color:'#00ff88', sortOrder:2 }
        ]);
    }
    for (const tv of ['left','right']) {
        if (!(await db.layouts.get(tv))) {
            await db.layouts.put({
                tvId: tv,
                rows: 3, cols: 2,
                timelines: [[], [], []],
                rowAnimationModes: ['cell', 'cell', 'cell'],
                rowSteps: [1, 1, 1],
                stripSteps: [1, 1, 1],
                rowCellGaps: [4, 4, 4],
                rowOffsets: [0, 2000, 4000],
            });
        }
    }
    return db;
}

export { db, initDB, DEFAULT_CONFIG };
