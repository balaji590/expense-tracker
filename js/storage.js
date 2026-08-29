/* Storage: all data lives in localStorage. No backend calls, ever. */
window.Storage = (function(){
  const KEYS = {
    expenses: 'et_expenses',
    categories: 'et_categories',
    budgets: 'et_budgets',
    recurring: 'et_recurring',
    settings: 'et_settings'
  };

  const DEFAULT_CATEGORIES = [
    {id:'cat_food', name:'Food', color:'#e0704a', icon:'F'},
    {id:'cat_grocery', name:'Groceries', color:'#4f9d69', icon:'G'},
    {id:'cat_transport', name:'Transport', color:'#4a90d9', icon:'T'},
    {id:'cat_shopping', name:'Shopping', color:'#d4568f', icon:'S'},
    {id:'cat_bills', name:'Bills', color:'#c99a2e', icon:'B'},
    {id:'cat_entertainment', name:'Entertainment', color:'#8b6fd6', icon:'E'},
    {id:'cat_health', name:'Health', color:'#3fb0a8', icon:'H'},
    {id:'cat_education', name:'Education', color:'#5d7fd6', icon:'E'},
    {id:'cat_travel', name:'Travel', color:'#3ba3c9', icon:'T'},
    {id:'cat_rent', name:'Rent', color:'#a8623e', icon:'R'},
    {id:'cat_subs', name:'Subscriptions', color:'#a15fc7', icon:'S'},
    {id:'cat_other', name:'Other', color:'#8b8f97', icon:'O'}
  ];

  function daysAgoISO(n){
    const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString();
  }

  function demoExpenses(){
    return [
      {id:'demo1', name:'Grocery run', amount:1450, category:'cat_grocery', date: daysAgoISO(2), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo2', name:'Movie night', amount:600, category:'cat_entertainment', date: daysAgoISO(4), paymentMethod:'Card', notes:'', tags:[], isDemo:true},
      {id:'demo3', name:'Electricity bill', amount:2100, category:'cat_bills', date: daysAgoISO(6), paymentMethod:'Bank Transfer', notes:'', tags:[], isDemo:true},
      {id:'demo4', name:'Lunch with team', amount:520, category:'cat_food', date: daysAgoISO(8), paymentMethod:'Cash', notes:'', tags:[], isDemo:true},
      {id:'demo5', name:'New shoes', amount:3200, category:'cat_shopping', date: daysAgoISO(12), paymentMethod:'Credit Card', notes:'', tags:[], isDemo:true},
      {id:'demo6', name:'Petrol', amount:1000, category:'cat_transport', date: daysAgoISO(15), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo7', name:'Netflix', amount:499, category:'cat_subs', date: daysAgoISO(20), paymentMethod:'Card', notes:'', tags:[], isDemo:true},
      {id:'demo8', name:'Doctor visit', amount:800, category:'cat_health', date: daysAgoISO(35), paymentMethod:'Cash', notes:'', tags:[], isDemo:true},
      {id:'demo9', name:'Train ticket', amount:1800, category:'cat_travel', date: daysAgoISO(40), paymentMethod:'UPI', notes:'', tags:[], isDemo:true},
      {id:'demo10', name:'Grocery run', amount:1620, category:'cat_grocery', date: daysAgoISO(48), paymentMethod:'UPI', notes:'', tags:[], isDemo:true}
    ];
  }

  function read(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      if(raw === null) return fallback;
      return JSON.parse(raw);
    }catch(e){ return fallback; }
  }
  function write(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch(e){ return false; }
  }

  function init(){
    if(localStorage.getItem(KEYS.categories) === null){
      write(KEYS.categories, DEFAULT_CATEGORIES);
    }
    if(localStorage.getItem(KEYS.expenses) === null){
      write(KEYS.expenses, demoExpenses());
    }
    if(localStorage.getItem(KEYS.budgets) === null){
      write(KEYS.budgets, {overall: null, categoryBudgets: {}});
    }
    if(localStorage.getItem(KEYS.recurring) === null){
      write(KEYS.recurring, []);
    }
    if(localStorage.getItem(KEYS.settings) === null){
      write(KEYS.settings, {theme:'light', currency:'INR'});
    }
  }

  return {
    KEYS, DEFAULT_CATEGORIES, init, read, write
  };
})();
