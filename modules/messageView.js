var $ = require('jquery');

function MessageViewer(){

}
MessageViewer.prototype = {
  formatHTML: function(html){
    var stage = $('<div>')
        .hide()
        .html(html)
        .find('.gmail_quote')
          .remove()
          .end()
        .find('#OLK_SRC_BODY_SECTION')
          .remove()
          .end()
        .find('.gmail_extra')
          .remove()
          .end()
        .find('#signature')
          .remove()
          .end();
    return stage.html();
  },
  clear: function(){
    $('#message_viewer').empty();
    return this;
  },
  displayMessages: function(mail_objs){
    var self = this;
    mail_objs.forEach(function(mail_obj){
      self.displayMessage(mail_obj);
    });
  },
  getToString: function(message_data){
    var self = this;
    var to = message_data.to;
    var arr = [];
    to.forEach(function(rec){
      if(rec.name){
        arr.push(self.parseName(rec.name));
      }
      else{
        arr.push(rec.address);
      }
    });
    return arr.join(', ');
  },
  getFromString:function(message_data){
    return this.parseName(message_data.from[0].name || message_data.from[0].address);
  },
  parseName:function(s){
    s = s.replace(/"/g,"");
    s = s.split(',');
    if(s.length>1){
      s.reverse();
      return s.join(' ');
    }
    return s[0];
  },
  displayMessage: function(message_data){

    var container = window.document.createElement('div');
    container.className = 'envelope';

    $('<p>')
      .addClass('from')
      .html(this.getFromString(message_data))
      .appendTo(container);
    $('<p>')
      .addClass('to')
      .html('To: '+this.getToString(message_data))
      .appendTo(container);

    var iframe = window.document.createElement('iframe');
    container.appendChild(iframe);

    var html = message_data.html || message_data.text;
    window.document.getElementById('message_viewer').appendChild(container);

    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional //EN" "http://www.w3.org/TR/html4/loose.dtd">'+
        '<html><head><link rel="stylesheet" href="css/message.css"><\/head><body>'+
        this.formatHTML(html)+
        '<\/body><\/html>'
    );
    iframe.contentWindow.document.close();
    iframe.attributes.frameborder = 0;

    $('iframe')
      .load(function(){
        autoResize(iframe);
      });
    autoResize(iframe);

    function autoResize(iframe){
        var newheight;
        var newwidth;
        if(!iframe.contentWindow){
          return;
        }
        if(!iframe.contentWindow.document){
          return;
        }
        if(!iframe.contentWindow.document.body){
          return;
        }
        newheight=iframe.contentWindow.document.body.scrollHeight;
        //newwidth=iframe.contentWindow.document.body.scrollWidth;
        iframe.height= (newheight) + "px";
        //iframe.width= (newwidth) + "px";
    }
  }
};

module.exports = MessageViewer;
