function A() {}
function B() {}
function C() {}
function D() {}

a = new A();
B.prototype = a;
b = new B();
C.prototype = b;
c = new C();
D.prototype = c;
d = new D();

console.log(b.__proto__== a) //print true
console.log(c.__proto__ == b) //print true
console.log(d.__proto__ == c) //print true
console.log(a.__proto__.__proto__.__proto__ == null) //print true
