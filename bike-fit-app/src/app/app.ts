import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  isMenuOpen = false;

  readonly navLinks = [
    { path: '/', label: 'ホーム' },
    { path: '/saddle-height', label: 'サドル高計算' },
    { path: '/kops', label: 'サドル前後位置（KOPS法）' },
    { path: '/tire-pressure', label: 'タイヤ空気圧計算' },
    { path: '/formulas', label: '計算式について' },
  ];

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
  }
}
