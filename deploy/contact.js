/* Contact reveal.
 *
 * The address never appears in the served HTML or in this file. Each
 * [data-ct-contact] element carries the local part and domain reversed in
 * data attributes; the address is only assembled after a person clicks
 * the button, so scrapers (including ones that execute JavaScript but
 * don't interact) see nothing usable.
 */
(function () {
  var SUBJECT = "Enquiry via clustertrial.app";

  function rev(s) { return (s || "").split("").reverse().join(""); }

  function reveal(box) {
    var addr = rev(box.getAttribute("data-u")) + String.fromCharCode(64) + rev(box.getAttribute("data-d"));

    var link = document.createElement("a");
    link.className = "ct-contact__addr";
    link.href = "mailto:" + addr + "?subject=" + encodeURIComponent(SUBJECT);
    link.textContent = addr;

    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "ct-contact__copy";
    copy.textContent = "Copy";
    copy.addEventListener("click", function () {
      var done = function () {
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = "Copy"; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(addr).then(done, function () {});
      }
    });

    box.textContent = "";
    box.appendChild(link);
    box.appendChild(copy);
    link.focus();
  }

  function init() {
    var boxes = document.querySelectorAll("[data-ct-contact]");
    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        var btn = box.querySelector("button");
        if (btn) btn.addEventListener("click", function () { reveal(box); });
      })(boxes[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
