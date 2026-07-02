import assert from 'node:assert/strict';

function createSession(db, input) { const id = `s${db.sessions.length+1}`; db.sessions.push({id, ...input}); return id; }
function applyTemplate(db, sessionId, templateId) {
  const session = db.sessions.find((s)=>s.id===sessionId);
  const template = db.templates.find((t)=>t.id===templateId);
  if (!session || session.user_id !== db.user) throw new Error('Session not found');
  if (!template || template.withdrawn_at || (template.visibility === 'private' && template.owner_user_id !== db.user)) throw new Error('Template not available');
  if (template.discipline !== session.discipline) throw new Error('Template discipline does not match this competition');
  if (session.copied_from_competition_template_id || db.copies.some((c)=>c.created_session_id===sessionId)) throw new Error('This competition already uses a shared setup');
  for (const table of ['postDetails','postTargets','targetDefinitions','misses','scorecardImports','participants']) {
    if (db[table].some((r)=>r.session_id===sessionId)) throw new Error('This setup can only be applied to a new, empty competition.');
  }
  if (db.courses.some((r)=>r.session_id===sessionId && (r.fitasc_scheme != null || r.shooter_number != null || r.start_plate != null))) throw new Error('This setup can only be applied to a new, empty competition.');
  const snapshot = JSON.parse(JSON.stringify({sessions:db.sessions,courses:db.courses,postDetails:db.postDetails,postTargets:db.postTargets,targetDefinitions:db.targetDefinitions,copies:db.copies}));
  try {
    db.courses = db.courses.filter((r)=>r.session_id !== sessionId);
    for (const row of template.courses) db.courses.push({...row, session_id: sessionId});
    if (template.failAfterCourses) throw new Error('insert failed');
    for (const row of template.postDetails) db.postDetails.push({...row, session_id: sessionId});
    for (const row of template.postTargets) db.postTargets.push({...row, session_id: sessionId});
    for (const row of template.targetDefinitions) db.targetDefinitions.push({...row, session_id: sessionId});
    session.copied_from_competition_template_id = template.id;
    session.copied_from_competition_template_version = template.version;
    db.copies.push({template_id: template.id, template_version: template.version, copied_by_user_id: db.user, created_session_id: sessionId});
  } catch (e) {
    Object.assign(db, snapshot);
    throw e;
  }
}
function fixture() { return {user:'u1',sessions:[],courses:[],postDetails:[],postTargets:[],targetDefinitions:[],misses:[],scorecardImports:[],participants:[],copies:[],templates:[{id:'t1',owner_user_id:'u2',visibility:'searchable',withdrawn_at:null,discipline:'Compak Sporting',version:3,courses:[{course_number:1,fitasc_scheme:2,shooter_number:4,start_plate:3}],postDetails:[],postTargets:[],targetDefinitions:[{course_number:1,machine:'A'}]},{id:'t2',owner_user_id:'u2',visibility:'private',withdrawn_at:null,discipline:'Compak Sporting',version:1,courses:[],postDetails:[],postTargets:[],targetDefinitions:[]},{id:'t3',owner_user_id:'u2',visibility:'searchable',withdrawn_at:'now',discipline:'Compak Sporting',version:1,courses:[],postDetails:[],postTargets:[],targetDefinitions:[]},{id:'t4',owner_user_id:'u2',visibility:'searchable',withdrawn_at:null,discipline:'Sporting',version:1,courses:[],postDetails:[],postTargets:[],targetDefinitions:[]}]}; }

let db = fixture();
let sessionId = createSession(db,{user_id:'u1',name:'RM Kismul',competition_date:'2026-07-01',shooting_ground:'Kismul',discipline:'Compak Sporting',shooting_format:'Squad',course_count:1,post_count:null,targets_per_post:null,own_score:null,winning_score:null,equipment_snapshot:{gun:'kept'}});
applyTemplate(db, sessionId, 't1');
assert.equal(db.sessions.length, 1, 'normal creation creates one session');
assert.deepEqual(db.sessions[0].equipment_snapshot, {gun:'kept'}, 'equipment is preserved');
assert.equal(db.sessions[0].shooting_format, 'Squad', 'shooting format is preserved');
assert.equal(db.sessions[0].course_count, 1, 'course settings are preserved on session');
assert.equal(db.sessions[0].name, 'RM Kismul'); assert.equal(db.sessions[0].competition_date, '2026-07-01'); assert.equal(db.sessions[0].shooting_ground, 'Kismul');
assert.equal(db.courses[0].session_id, sessionId, 'template setup is added to same session');
assert.equal(db.sessions[0].copied_from_competition_template_id, 't1'); assert.equal(db.sessions[0].copied_from_competition_template_version, 3);

let resultDb = fixture();
let resultId = createSession(resultDb,{user_id:'u1',name:'Result',discipline:'Compak Sporting',own_score:88,winning_score:94,notes:'windy',equipment_snapshot:{ammo:'kept'},total_targets:100});
applyTemplate(resultDb,resultId,'t1');
assert.equal(resultDb.sessions.length,1,'result-only does not create extra session');
assert.equal(resultDb.sessions[0].own_score,88); assert.equal(resultDb.sessions[0].winning_score,94); assert.equal(resultDb.sessions[0].notes,'windy'); assert.deepEqual(resultDb.sessions[0].equipment_snapshot,{ammo:'kept'});
assert.equal(resultDb.targetDefinitions[0].session_id,resultId,'result and template setup share same session');

let blockedDb = fixture(); let blockedId = createSession(blockedDb,{user_id:'u1',discipline:'Compak Sporting'}); blockedDb.postTargets.push({session_id:blockedId}); assert.throws(()=>applyTemplate(blockedDb,blockedId,'t1'),/empty competition/,'existing setup blocks apply');
let meaningfulCourseDb = fixture(); let meaningfulCourseId = createSession(meaningfulCourseDb,{user_id:'u1',discipline:'Compak Sporting'}); meaningfulCourseDb.courses.push({session_id:meaningfulCourseId,fitasc_scheme:2,shooter_number:null,start_plate:null}); assert.throws(()=>applyTemplate(meaningfulCourseDb,meaningfulCourseId,'t1'),/empty competition/,'meaningful courses block apply');
assert.throws(()=>{ const d=fixture(); const id=createSession(d,{user_id:'u2',discipline:'Compak Sporting'}); applyTemplate(d,id,'t1'); },/Session not found/,'other user session cannot be changed');
assert.throws(()=>{ const d=fixture(); const id=createSession(d,{user_id:'u1',discipline:'Compak Sporting'}); applyTemplate(d,id,'t4'); },/discipline/,'other discipline blocks');
assert.throws(()=>{ const d=fixture(); const id=createSession(d,{user_id:'u1',discipline:'Compak Sporting'}); applyTemplate(d,id,'t3'); },/Template not available/,'withdrawn blocks');
assert.throws(()=>{ const d=fixture(); const id=createSession(d,{user_id:'u1',discipline:'Compak Sporting'}); applyTemplate(d,id,'t2'); },/Template not available/,'private template blocks for others');
for (const table of ['postTargets','misses','scorecardImports','participants']) { const d=fixture(); const id=createSession(d,{user_id:'u1',discipline:'Compak Sporting'}); d[table].push({session_id:id}); assert.throws(()=>applyTemplate(d,id,'t1'),/empty competition/,`${table} blocks apply`); assert.equal(d[table].length,1,`${table} is not deleted`); }
let rollbackDb = fixture(); rollbackDb.templates[0].failAfterCourses = true; let rollbackId = createSession(rollbackDb,{user_id:'u1',discipline:'Compak Sporting'}); assert.throws(()=>applyTemplate(rollbackDb,rollbackId,'t1'),/insert failed/); assert.equal(rollbackDb.courses.length,0,'partial failure rolls back');
let doubleDb = fixture(); let doubleId = createSession(doubleDb,{user_id:'u1',discipline:'Compak Sporting'}); applyTemplate(doubleDb,doubleId,'t1'); assert.throws(()=>applyTemplate(doubleDb,doubleId,'t1'),/already uses/,'double apply does not copy twice');
console.log('competition template apply flow tests passed');
