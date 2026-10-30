const frame=document.getElementById('review-frame');
let resizeObserver;
const measure=()=>{const d=frame.contentDocument;document.getElementById('review-size').textContent=`화면 ${frame.contentWindow.innerWidth}px · 문서 ${d.documentElement.scrollWidth}px`;};
document.getElementById('review-page').onchange=e=>{frame.src='../'+e.target.value;};
document.getElementById('review-width').onchange=e=>{frame.style.width=e.target.value+'px';};
frame.addEventListener('load',()=>{resizeObserver?.disconnect();resizeObserver=new ResizeObserver(measure);resizeObserver.observe(frame.contentDocument.documentElement);measure();});
