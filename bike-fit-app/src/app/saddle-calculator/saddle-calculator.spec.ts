import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaddleCalculator } from './saddle-calculator';

describe('SaddleCalculator', () => {
  let component: SaddleCalculator;
  let fixture: ComponentFixture<SaddleCalculator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaddleCalculator],
    }).compileComponents();

    fixture = TestBed.createComponent(SaddleCalculator);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
