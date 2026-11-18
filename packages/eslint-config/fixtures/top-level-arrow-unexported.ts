const double = (value: number): number => value * 2;

export function quadruple(value: number): number {
  return double(double(value));
}
