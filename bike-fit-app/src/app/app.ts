import { Component } from '@angular/core';
import { SaddleCalculator } from './saddle-calculator/saddle-calculator';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    SaddleCalculator
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

}