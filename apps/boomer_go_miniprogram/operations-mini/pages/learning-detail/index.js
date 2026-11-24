const ops = () => getApp().operations;

Page({
  data: { item:null, run:null, answers:[], result:null, loading:true, busy:false, error:'', cover:'' },
  onLoad({ id }) { this._id=id; this._active=true; return this.load(); },
  onUnload() {
    this._active=false;
    if (this._cover) wx.getFileSystemManager().unlink({ filePath:this._cover, fail(){} });
  },
  async load() {
    const o=ops();
    if (!o.current()) return wx.reLaunch({ url:'/pages/login/index' });
    this.setData({ loading:true,error:'' });
    try {
      const item=await o.learning.detail(this._id);
      if (!this._active) return;
      this.setData({ item,cover:item.cover_url||'' });
      if (item.cover_id && !this._cover) void this.resolveCover(item.cover_id);
    } catch (e) { if (this._active) this.fail(e); }
    finally { if (this._active) this.setData({ loading:false }); }
  },
  async resolveCover(id) {
    try {
      const bytes=await ops().learning.cover(id);
      if (!this._active) return;
      const fs=wx.getFileSystemManager(), filePath=wx.env.USER_DATA_PATH+'/go-proof-'+id+'.jpeg';
      await new Promise((resolve,reject)=>fs.writeFile({ filePath,data:bytes,success:resolve,fail:reject }));
      if (!this._active) return fs.unlink({filePath,fail(){}});
      this._cover=filePath;
      this.setData({ cover:filePath });
    } catch (_) { /* Text remains readable when an image is unavailable. */ }
  },
  fail(e) {
    if (!ops().current()) return wx.reLaunch({ url:'/pages/login/index' });
    this.setData({ error:e.message||'操作失败，请重试' });
  },
  async favorite() {
    if (this.data.busy||!this.data.item) return;
    this.setData({busy:true,error:''});
    try {
      const r=await ops().learning.favorite(this._id, !this.data.item.favorite);
      if (this._active) this.setData({'item.favorite':r.favorite===true});
    } catch(e){ if(this._active)this.fail(e); }
    finally{ if(this._active)this.setData({busy:false}); }
  },
  async completeTraining() {
    if(this.data.busy||this.data.item?.kind!=='training'||this.data.item.training_complete)return;
    this.setData({busy:true,error:''});
    try{
      const result=await ops().learning.completeTraining(this._id);
      if(result.training_complete!==true)throw new Error('未确认培训完成记录');
      if(this._active)this.setData({'item.training_complete':true});
    }catch(e){if(this._active)this.fail(e);}
    finally{if(this._active)this.setData({busy:false});}
  },
  async start() {
    if (this.data.busy||!this.data.item.quiz_available) return;
    this.setData({busy:true,error:''});
    try {
      const run=await ops().learning.start(this._id);
      if (this._active) { this._submitted=null; this.setData({ run,answers:run.questions.map(()=>-1),result:null }); }
    } catch(e){ if(this._active)this.fail(e); }
    finally{ if(this._active)this.setData({busy:false}); }
  },
  pick(e){
    if (this.data.busy || this.data.result || this._submitted) return;
    const { question,option }=e.currentTarget.dataset;
    if(Number.isInteger(question)&&Number.isInteger(option))this.setData({['answers['+question+']']:option});
  },
  async submit() {
    if(this.data.busy||!this.data.run) return;
    if(this.data.answers.some(a=>a<0))return this.setData({error:'还有题目未作答'});
    this._submitted=this._submitted||this.data.answers.slice();
    this.setData({busy:true,error:''});
    try {
      const result=await ops().learning.submit(this.data.run.id,this._submitted);
      if(this._active)this.setData({result});
    }catch(e){if(this._active)this.fail(e);}
    finally{if(this._active)this.setData({busy:false});}
  }
});
