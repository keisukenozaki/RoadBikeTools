import { Routes } from '@angular/router';
import { Home } from './home/home';
import { SaddleCalculator } from './saddle-calculator/saddle-calculator';
import { KopsCalculator } from './kops-calculator/kops-calculator';
import { TirePressureCalculator } from './tire-pressure-calculator/tire-pressure-calculator';
import { FormulaInfo } from './formula-info/formula-info';
import { ReachDropCalculator } from './reach-drop-calculator/reach-drop-calculator';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'saddle-height', component: SaddleCalculator },
  { path: 'kops', component: KopsCalculator },
  { path: 'tire-pressure', component: TirePressureCalculator },
  { path: 'reach-drop', component: ReachDropCalculator },
  { path: 'formulas', component: FormulaInfo },
  { path: '**', redirectTo: '' },
];
