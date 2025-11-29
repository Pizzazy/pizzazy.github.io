// Very small path morph fallback: numeric interpolation of numbers inside 'd' strings.
// It attempts to parse numbers from both paths and, if count matches, returns an interpolator function(t)
// that reconstructs the path by linearly interpolating the numeric values. If counts differ, it returns
// a function that swaps at t>=1 (fallback handled elsewhere).
(function(window){
  function extractNumbers(d){
    // match floats, including scientific notation
    var re = /-?\d*\.?\d+(?:e[+-]?\d+)?/gi;
    var m, nums = [];
    while((m = re.exec(d)) !== null){ nums.push(parseFloat(m[0])); }
    return nums;
  }
  function replaceNumbers(d, nums){
    var re = /-?\d*\.?\d+(?:e[+-]?\d+)?/gi;
    var i = 0;
    return d.replace(re, function(){ var v = nums[i++]; return (Math.round(v*1000)/1000).toString(); });
  }
  function interpolatePath(a,b){
    var an = extractNumbers(a);
    var bn = extractNumbers(b);
    if(an.length !== bn.length) return null;
    return function(t){
      var out = new Array(an.length);
      for(var i=0;i<an.length;i++) out[i] = an[i] + (bn[i]-an[i])*t;
      return replaceNumbers(a, out);
    };
  }
  window.simpleMorph = { interpolate: interpolatePath };
})(window);
