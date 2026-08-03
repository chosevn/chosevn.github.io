<script>
  function loadGoogleAnalytics(id) {
    var firstScript = document.getElementsByTagName("script")[0];
    var newScript = document.createElement("script");
    newScript.async = true;
    newScript.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
    firstScript.parentNode.insertBefore(newScript, firstScript);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', id);
  }

  window.addEventListener("load", function() {
    if (navigator.webdriver) {
      console.log('Bot Browser');
      loadGoogleAnalytics("G-HZPSTNML9Q");  // Bot-specific ID
    } else {
      console.log('Human Browser');
      loadGoogleAnalytics("G-HZPSTNML9Q");  // Human-specific ID
    }
  });
</script>
