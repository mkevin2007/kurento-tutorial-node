[![License badge](https://img.shields.io/badge/license-Apache2-orange.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Documentation badge](https://readthedocs.org/projects/fiware-orion/badge/?version=latest)](http://doc-kurento.readthedocs.org/en/latest/)
[![Docker badge](https://img.shields.io/docker/pulls/fiware/orion.svg)](https://hub.docker.com/r/fiware/stream-oriented-kurento/)
[![Support badge]( https://img.shields.io/badge/support-sof-yellowgreen.svg)](http://stackoverflow.com/questions/tagged/kurento)

<img id="logo-header" src="https://admin.netsfere.com/images/emailLogo.png" alt="NetSfere Logo">

NetStream-demo
=====================

Netstream Node.js Demo: WebRTC one to many video call based on http://doc-kurento.readthedocs.io/en/stable/tutorials/node/tutorial-one2many.html

Important Files
=====================

<b>static/index.html:</b> markup <br>
<b>static/css/netStream.css:</b> style-sheet <br>
<b>static/js/index.js:</b> client-side code <br>
<b>server.js:</b> server-side code

Debugging help
=====================

There are lots of error logs for both the server and the client.
If the server log gets too long for the terminal run this: npm start | tee log.txt.
This will put your error logs in another file called log.txt.
