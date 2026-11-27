import {describe,it,expect} from 'vitest';
import {CATEGORY_KEY,categoriesFrom,changeCategory,dashboardObject,selectSmartCategory,smartHasLink,isSmartLink} from './smartBreakCategories';
describe('Smart Break categories',()=>{
 it('provides seven defaults only when no registry has been saved',()=>{expect(categoriesFrom(null)).toHaveLength(7);expect(categoriesFrom({[CATEGORY_KEY]:[]})).toEqual([])});
 it('archives categories without removing them or resetting defaults',()=>{const rows=categoriesFrom(null);const next=changeCategory(rows,{...rows[0],deleted:true});expect(next).toHaveLength(7);expect(categoriesFrom({[CATEGORY_KEY]:next})[0].deleted).toBe(true)});
 it('rejects duplicate names case insensitively',()=>{expect(()=>changeCategory(categoriesFrom(null),{id:'new',name:' promos ',kind:'custom'})).toThrow()});
 it('preserves old dashboard items and defaults the purchase button',()=>{expect(dashboardObject([1])).toEqual({items:[1]});expect(selectSmartCategory(categoriesFrom(null)[2]).buttonLabel).toBe('Comprar')});
 it('does not display a QR without a valid link',()=>{expect(isSmartLink('')).toBe(false);expect(isSmartLink('javascript:alert(1)')).toBe(false);expect(smartHasLink('sbs')).toBe(false);expect(smartHasLink('music')).toBe(true)});
});
