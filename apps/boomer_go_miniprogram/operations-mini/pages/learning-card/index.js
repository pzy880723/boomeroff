const { photoType, MAX_PHOTO } = require('../../shared/operations');
const ops = () => getApp().operations;
const newId = () => Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
const header = (fields) => ({
  title:fields.title||'', summary:fields.summary||'', details:fields.details||'', tips:fields.tips||''
});

Page({
  data: { stage:'choose',kind:'knowledge',kindName:'知识卡',title:'',note:'',photo:'',ready:null,fields:{},error:'',busy:false,saved:null },
  onLoad() {
    this._active=true;
    if (!ops().current()) return wx.reLaunch({ url:'/pages/login/index' });
    if (!ops().current().canGenerateCards) this.setData({stage:'denied'});
  },
  onUnload(){this._active=false;clearTimeout(this._timer);},
  choose(e) {
    const kind=e.currentTarget.dataset.kind;
    if (!['product','knowledge'].includes(kind)||this.data.busy) return;
    this._nonce=null;
    this.setData({stage:'form',kind,kindName:kind==='product'?'商品卡':'知识卡',error:''});
  },
  input(e){
    const field=e.currentTarget.dataset.field;
    if (!this.data.busy&&['title','note'].includes(field)) this.setData({[field]:e.detail.value});
  },
  edit(e){
    const field=e.currentTarget.dataset.field;
    if(!this.data.busy&&['title','summary','details','tips'].includes(field))this.setData({['fields.'+field]:e.detail.value});
  },
  async choosePhoto() {
    if(this.data.busy)return;
    try {
      const file=await new Promise((resolve,reject)=>wx.chooseMedia({count:1,mediaType:['image'],sizeType:['compressed'],sourceType:['camera','album'],
        success:({tempFiles})=>resolve(tempFiles[0]),fail:e=>/cancel/i.test(e.errMsg||'')?resolve(null):reject(new Error('无法打开相机或相册')) }));
      if(!this._active||!file)return;
      if(file.size>MAX_PHOTO)throw new Error('请选择 6 MB 内的照片');
      this.setData({photo:file.tempFilePath,error:''});
    }catch(e){if(this._active)this.setData({error:e.message});}
  },
  removePhoto(){if(!this.data.busy)this.setData({photo:''});},
  async attach(key) {
    const photo=this.data.photo;
    if(!photo || this._attached?.key===key&&this._attached.photo===photo)return;
    const data=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({
      filePath:photo,success:o=>resolve(o.data),fail:()=>reject(new Error('参考图无法读取，请重新选择'))}));
    const mime=photoType(data);
    if(!mime)throw new Error('请选择 6 MB 内的 JPG、PNG 或 WebP 照片');
    if(!this._active)return;
    const ok=await ops().learning.attach(key,data,mime);
    if(!ok.has_photo)throw new Error('未确认参考图上传结果');
    this._attached={key,photo};
  },
  async generate() {
    if(this.data.busy||!ops().current()?.canGenerateCards)return;
    const {kind,title,note}=this.data;
    if(!title.trim())return this.setData({error:'请先填写名称或主题'});
    const body={kind,title:title.trim(),note:note.trim()};
    const fingerprint=JSON.stringify(body);
    if(this._nonce?.fingerprint!==fingerprint)this._nonce={fingerprint,key:newId()};
    this._polls=0;
    this.setData({stage:'generating',busy:true,error:''});
    try {
      const draft=await ops().learning.generate({...body,request_id:this._nonce.key});
      if(!this._active)return;
      this._draftId=draft.id;
      if(this.data.photo) await this.attach(draft.id);
      else if(draft.has_photo && draft.status!=='saved') {
        await ops().learning.clearPhoto(draft.id);
        this._attached=null;
      }
      if(this._active)this.show(draft);
    } catch(e){if(this._active)this.setData({stage:'form',busy:false,error:e.message});}
  },
  show(draft){
    if(draft.status==='ready'&&draft.fields){
      this.setData({stage:'preview',fields:header(draft.fields),busy:false,error:''});return;
    }
    if(draft.status==='saved'){
      this.setData({stage:'saved',busy:false,error:''});return;
    }
    if(draft.status==='failed'){
      this.setData({stage:'failed',busy:false,error:'生成没有成功，原输入已保留。'});return;
    }
    if(draft.status!=='generating'||++this._polls>55){
      this.setData({stage:'waiting',busy:false,error:'尚未确认生成结果，先查状态，不重复发起。'});return;
    }
    clearTimeout(this._timer);
    this._timer=setTimeout(()=>this.check(),1600);
  },
  async check(){
    if(!this._active||!this._draftId)return;
    try{
      const draft=await ops().learning.draft(this._draftId);
      if(this._active)this.show(draft);
    }catch(e){if(this._active)this.setData({stage:'waiting',busy:false,error:e.message});}
  },
  async retry(){
    if(this.data.busy||!this._draftId)return;
    this._polls=0;
    const was=this.data.stage;
    this.setData({stage:'generating',busy:true,error:''});
    if(was==='waiting')return this.check();
    try {
      const draft=await ops().learning.retry(this._draftId,newId());
      if(this._active)this.show(draft);
    }catch(e){if(this._active)this.setData({stage:'waiting',busy:false,error:e.message});}
  },
  revise(){
    if(!this.data.busy){
      if(this.data.stage==='preview')return this.setData({stage:'edit',error:''});
      this.setData({stage:'form',error:''});
    }
  },
  preview(){if(!this.data.busy)this.setData({stage:'preview',error:''});},
  async save(){
    if(this.data.busy||this.data.stage!=='preview'||!this._draftId)return;
    const fields=header(this.data.fields);
    if(!fields.title.trim()||!fields.summary.trim()||!fields.details.trim())return this.setData({error:'名称、简介和主要内容不能为空'});
    this._saveFields=this._saveFields||fields;
    this.setData({busy:true,error:''});
    try {
      const saved=await ops().learning.save(this._draftId,this._saveFields);
      if(this._active){
        if(saved.id!==this._draftId)throw new Error('未确认保存回执');
        this.setData({stage:'saved',saved});
      }
    } catch(e){
      if(this._active)this.setData({stage:'saveWaiting',error:e.message});
    } finally {if(this._active)this.setData({busy:false});}
  },
  async confirmSave(){
    if(this.data.busy)return;
    this.setData({busy:true,error:''});
    try{
      const d=await ops().learning.draft(this._draftId);
      if(!this._active)return;
      if(d.status==='saved')return this.setData({stage:'saved'});
      this._saveFields=null;
      this.setData({stage:'preview'});
    }catch(e){if(this._active)this.setData({error:e.message});}
    finally{if(this._active)this.setData({busy:false});}
  },
  again(){
    this._draftId=this._nonce=this._attached=this._saveFields=null;
    this.setData({stage:'choose',title:'',note:'',photo:'',fields:{},saved:null,error:''});
  },
  back(){wx.navigateBack({fail:()=>wx.switchTab({url:'/pages/learning/index'})});}
});
