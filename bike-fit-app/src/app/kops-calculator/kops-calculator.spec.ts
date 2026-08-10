import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KopsCalculator } from './kops-calculator';

describe('KopsCalculator', () => {
  let component: KopsCalculator;
  let fixture: ComponentFixture<KopsCalculator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KopsCalculator],
    }).compileComponents();

    fixture = TestBed.createComponent(KopsCalculator);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should advance through the tap steps in order', () => {
    expect(component.stepIndex).toBe(0);
    expect(component.currentStepLabel).toContain('膝');
  });
});
