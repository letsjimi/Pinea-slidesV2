// PINEA Slides V2 — Dexie Database
const db = new Dexie('PineaSlidesV3');
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
                step: 1, cellGap: 4, useMatrix: true,
                rowOffsets: [0, 2000, 4000],
            });
        }
    }
    return db;
}

export { db, initDB, DEFAULT_CONFIG };
