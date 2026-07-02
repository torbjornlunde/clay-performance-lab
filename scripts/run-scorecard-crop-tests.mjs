import assert from 'node:assert/strict';
function clampCrop(crop){const x=Math.max(0,Math.min(1,crop.x));const y=Math.max(0,Math.min(1,crop.y));const width=Math.max(0.02,Math.min(1-x,crop.width));const height=Math.max(0.02,Math.min(1-y,crop.height));return{x,y,width,height,mode:crop.mode||((x===0&&y===0&&width===1&&height===1)?'full':'crop')}}
function stageReducer(state,event){ if(event==='prepare') return 'Preparing image'; if(event==='upload') return 'Uploading image'; if(event==='ai') return 'Reading shooter rows and marks'; if(event==='normalize') return 'Checking detected results'; if(event==='review') return 'Preparing review'; if(event==='cancel') return ''; return state; }
function timeoutMessage(full){return full?'This overview image was too large to analyze in time. Crop to one shooter’s scorecard and try again.':'The scorecard could not be analyzed in time. Check that the image is sharp and includes the full grid, then retry.'}
assert.deepEqual(clampCrop({x:-1,y:2,width:9,height:9}),{x:0,y:1,width:1,height:0.02,mode:'crop'});
assert.deepEqual(clampCrop({x:0,y:0,width:1,height:1}),{x:0,y:0,width:1,height:1,mode:'full'});
assert.equal(stageReducer('', 'prepare'),'Preparing image');
assert.equal(stageReducer('', 'upload'),'Uploading image');
assert.equal(stageReducer('', 'cancel'),'');
assert.match(timeoutMessage(true),/overview image was too large/);
assert.match(timeoutMessage(false),/could not be analyzed in time/);
console.log('scorecard crop/progress behavior tests passed');
