import {describe,it,expect,vi,afterEach} from 'vitest';
import {slotFree} from './barbershop';
afterEach(()=>vi.useRealTimers());
describe('barbearia: disponibilidade',()=>{
 const base=()=>({days:[1,2,3,4,5,6],open:'09:00',close:'19:00',appointments:[{barberId:'a',date:'2030-01-07',time:'10:00',duration:45,status:'agendado'}]});
 it('rejeita sobreposição parcial e permite limite exato e outro barbeiro',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2029-01-01'));
 expect(slotFree(base(),'a','2030-01-07','09:45',30)).toBe(false);
 expect(slotFree(base(),'a','2030-01-07','10:30',30)).toBe(false);
 expect(slotFree(base(),'a','2030-01-07','10:45',30)).toBe(true);
 expect(slotFree(base(),'b','2030-01-07','10:00',30)).toBe(true);
 });
 it('rejeita fechamento, dias fechados e horários passados',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2029-01-01'));
 expect(slotFree(base(),'a','2030-01-07','18:45',30)).toBe(false);
 expect(slotFree(base(),'a','2030-01-06','11:00',30)).toBe(false);
 expect(slotFree(base(),'a','2028-01-03','11:00',30)).toBe(false);
 });
 it('libera reserva cancelada',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2029-01-01'));
 const s=base();s.appointments[0].status='cancelado';expect(slotFree(s,'a','2030-01-07','10:00',30)).toBe(true);
 });
});
