import EventEmitter from 'events';
import SubscriptionProvider from '../SubscriptionProvider';

export default class Web3Contract {
  constructor({chain, master, tellor, caller}) {
    
    this.chain = chain;
    this.master = master;
    this.caller = caller;
    this.tellor = tellor;
    this.eventHistory = {};
    this._emitter = new EventEmitter();

    [
      'init',
      'emitEvents',
      'getPastEvents',
      'startSubscriptions',
      'unload',
      'requestData',
      'addTip',
      'getCurrentVariables',
      'getVariablesOnDeck',
      'getRequestVars',
      'getRequestIdByQueryHash',
      'getMinersByRequestIdAndTimestamp',
      'getDisputeIdByDisputeHash',
      'getAllDisputeVars',
      'beginDispute',
      'didVote',
      'isInDispute',
      'vote',
      'getTokens',
      'balanceOf',
      '_call',
      '_send'
    ].forEach(fn=>{
      if(!this[fn]) { throw new Error("Web3Contract missing fn: " + fn)}
      this[fn]=this[fn].bind(this);
    });

    this._emitter = new EventEmitter();
    this.events = new SubscriptionProvider({
      chain: this._emitter //pretend our emitter is the blockchain
    });
  }

  emitEvents(events) {
    console.log("Emitting events", events);
    this._emitter.emit("blockEvents", {events});
  }

  async getPastEvents(event, opts, callback) {
    console.log("Getting past events");
    let r = await this.master.getPastEvents(event||"allEvents", opts, async (err, events) => {
      if(events) {

        //we need to replay the blocks in their ascending time order. So we
        //first make sure blocks are sorted by blockNumber and logIndex
        events.sort((a,b)=>{
          let diff = a.blockNumber - b.blockNumber;
          if(diff) {
            return diff;
          }
          return a.logIndex = b.logIndex;
        });
        for(let i=0;i<events.length;++i) {
          let e = events[i];
          let b = await this.chain.web3.eth.getBlock(e.blockNumber);
          if(b) {
            this[b.blockNumber] = b.timestamp;
            //apply the time to the event as well
            e.timestamp = b.timestamp;
            await this.chain._storeBlockTime(b);
          }
        }
        if(callback) {
          let p = callback(events);
          if(p instanceof Promise) {
            await p;
          }
        }
        return events;
      }
      if(err)
        throw err;
    });
    return r;
  }

  async startSubscriptions() {


  }

  _call(con, method, args) {
    return con.methods[method](...args).call({
      from: this.caller,
      gas: 100000
    });
  }

  _send(con, method, args) {
    let tx = con.methods[method](...args);
      return new Promise((done,err)=>{
        this.chain.web3.eth.sendTransaction({
            to: con.address,
            from: this.caller,
            data: tx.encodeABI()
          }, (e, r)=>{
            if(e) {
              err(e);
            } else {
              done(r);
            }
          });
      });
  }

  async init() {

  }

  async unload() {
    if(this.sub) {
      await this.sub.unsubscribe();
      this.sub = null;
    }
  }

  getCurrentVariables() {
    return this._call(this.master, "getCurrentVariables", []);
  }

  getRequestVars(_apiId) {
    return this._call(this.master, "getRequestVars", [_apiId]);
  }

  getRequestIdByQueryHash(hash) {
    return this._call(this.master, "getRequestIdByQueryHash", [hash]);
  }

  getVariablesOnDeck() {
    return this._call(this.master, "getVariablesOnDeck", []);
  }

  getMinersByRequestIdAndTimestamp(requestId, timestamp) {
    return this._call(this.master, "getMinersByRequestIdAndTimestamp", [requestId, timestamp]);
  }

  requestData(queryString, symbol, requestId, multiplier, tip) {
    return this._send(this.master, "requestData", [queryString, symbol, requestId, multiplier, tip]);
  }

  addTip(requestId, tip) {
    return this._send(this.master, "addTip", [requestId, tip]);
  }

  getTokens() {

    //nice fn name :(
    return this._send(this.master, "theLazyCoon", [this.caller,"1000000000000000000000"]);
  }

  balanceOf(addr) {
    return this._call(this.master, "balanceOf", [addr]);
  }

  getDisputeIdByDisputeHash(hash) {
    return this._call(this.master, "getDisputeIdByDisputeHash", [hash]);
  }

  getAllDisputeVars(id) {
    return this._call(this.master, "getAllDisputeVars", [id]);
  }

  beginDispute(requestId, timestamp, minerIndex) {
    return this._send(this.master, "beginDispute", [requestId, timestamp, minerIndex]);
  }

  didVote(disputeId, user) {
    return this._call(this.master, "didVote", [disputeId, user]);
  }

  vote(disputeId, supportsDisputer) {
    return this._send(this.master, "vote", [disputeId, supportsDisputer]);
  }

  async isInDispute(address) {
    let vars = await this._call(this.master, "getStakerInfo", [address]);
    return (vars[0].toString()-0)!==3;
  }
}
