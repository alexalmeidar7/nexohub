export type SmartKind = 'music' | 'promos' | 'spot' | 'intercom' | 'news' | 'sports' | 'sbs' | 'custom';
export type SmartCategory = { id: string; name: string; kind: SmartKind; deleted?: boolean };
export type SmartVideo = { id: string; url: string; duration: number; name?: string };
export type SmartFields = {
 categoryId?: string; categoryName?: string; categoryKind?: SmartKind;
 song?: string; artist?: string; artistImage?: string; artistImageMode?: 'auto'|'manual';
 productDescription?: string; productPrice?: string; buttonLabel?: string;
 sbsEntry?: SmartVideo[]; sbsExit?: SmartVideo[];
};
export const DEFAULT_SMART_CATEGORIES: SmartCategory[] = [
 {id:'music',name:'Música',kind:'music'}, {id:'promos',name:'Promos',kind:'promos'},
 {id:'spot',name:'Spot criativo (cliente)',kind:'spot'}, {id:'intercom',name:'Intercom / Promos',kind:'intercom'},
 {id:'news',name:'Boletim notícia',kind:'news'}, {id:'sports',name:'Boletim esporte',kind:'sports'}, {id:'sbs',name:'SBS',kind:'sbs'}
];
const kinds: SmartKind[] = ['music','promos','spot','intercom','news','sports','sbs','custom'];
export const CATEGORY_KEY = 'smart_break_categories_v1';
export function dashboardObject(value:unknown):Record<string,unknown>{
 if(Array.isArray(value))return {items:value};
 return value&&typeof value==='object'?{...value as Record<string,unknown>}:{};
}
export function categoriesFrom(value:unknown):SmartCategory[]{
 const stored=dashboardObject(value)[CATEGORY_KEY];
 if(!Array.isArray(stored))return DEFAULT_SMART_CATEGORIES.map(c=>({...c}));
 return stored.filter((c):c is SmartCategory=>!!c&&typeof c.id==='string'&&typeof c.name==='string'&&kinds.includes(c.kind));
}
export function changeCategory(rows:SmartCategory[], category:SmartCategory):SmartCategory[]{
 const name=category.name.trim();
 if(!name||name.length>100)throw Error('Informe um nome de categoria de até 100 caracteres.');
 if(!category.deleted&&rows.some(c=>!c.deleted&&c.id!==category.id&&c.name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Já existe uma categoria com esse nome.');
 return rows.some(c=>c.id===category.id)?rows.map(c=>c.id===category.id?{...category,name}:c):[...rows,{...category,name}];
}
export function selectSmartCategory(category:SmartCategory):SmartFields {
 return {categoryId:category.id,categoryName:category.name,categoryKind:category.kind,...(category.kind==='spot'?{buttonLabel:'Comprar'}:{})};
}
export function smartHasLink(kind:SmartKind|undefined){return kind===undefined||['music','spot','news','sports','custom'].includes(kind)}
export function isSmartLink(value:string){try{return ['https:','http:'].includes(new URL(value).protocol)}catch{return false}}
