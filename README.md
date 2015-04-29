# vlc-rc-server

Hobby project of a simple web-server with minimalist client design that enables to control VLC player on HTPC.
Client can be opened in browser from any device in home network.

Server uses http to receive commands from clients and websocket in order to translate player state to clients.



### Installation

Just run
```bash
$ npm install
```
in project folder to install dependencies.

The following shall be done once to enable and configure VLC Player RC Interface before start:
  - in *Preferences > Interface > Main Interfaces* check *Remote control interface*
  - in *Preferences > Interface > Main Interfaces > RC* check *fake TTY* and set path to socket file in *UNIX socket command input* field.

Make sure that VLC player has permissions to make and write files in this directory.


### Config

To set up server, it is necessary to change values in config.json:

    - 'mediaFolder' : path to directory, where server will look for media files;
    - 'vlcCommand'  : string to run VLC player from a command shell (/usr/bin/vlc);
    - 'socketFile'  : path to VLC RC interface socket file;
    - 'ip' : server's ip address;
    - 'httpPort' : port for http that enables to receive commands from clients;
    - 'websocketPort' : port for websocket that enables to translate player state to clients;
    - 'searchTimeStep' : time shift value in seconds for forward and backward buttons.



### License

[MIT](LICENSE)