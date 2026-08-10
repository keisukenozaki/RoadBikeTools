import { Routes } from '@angular/router';
import { SaddleCalculator } from './saddle-calculator/saddle-calculator';
import { KopsCalculator } from './kops-calculator/kops-calculator';

export const routes: Routes = [
  { path: '', component: SaddleCalculator },
  { path: 'kops', component: KopsCalculator },
  { path: '**', redirectTo: '' },
];
