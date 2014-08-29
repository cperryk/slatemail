var $ = require('jquery');

var messageView = {
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
  clear:function(){
    $('#message_viewer')
      .removeClass('with_top');
    $('#messages').empty();
    $('#top')
      .hide();
    return this;
  },
  displayMessages: function(mail_objs){
    var self = this;
    mail_objs.forEach(function(mail_obj){
      messageView.displayMessage(mail_obj);
    });
    messageView.displayTop(mail_objs);
  },
  displayTop: function(mail_objs){
    var subject = mail_objs[0].subject;
    var message_count = mail_objs.length;
    var attachments_count = (function(){
      var c = 0;
      mail_objs.forEach(function(mail_obj){
        console.log(mail_obj);
        if(mail_obj.attachments){
          c += mail_obj.attachments.length;
        }
      });
      return c;
    }());
    $('#thread_subject')
      .html(subject);
    $('#message_count')
      .html('Messages: '+message_count+', Attachments: '+attachments_count);
    $('#top')
      .show();
    $('#message_viewer').addClass('with_top');
  },
  getToString: function(message_data){
    var self = this;
    var to = message_data.to;
    var arr = [];
    for(var i=0;i<to.length;i++){
      var rec = to[i];
      if(rec.name){
        arr.push(messageView.parseName(rec.name));
      }
      else{
        arr.push(rec.address);
      }
      if(i===5 && to.length > 6){
        arr.push('and '+(to.length-i-1)+' others');
        break;
      }
    }
    return arr.join(', ');
  },
  getFromString:function(message_data){
    return messageView.parseName(message_data.from[0].name || message_data.from[0].address);
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
      .html(messageView.getFromString(message_data))
      .appendTo(container);
    $('<p>')
      .addClass('to')
      .html('To: '+messageView.getToString(message_data))
      .appendTo(container);

    var iframe = window.document.createElement('iframe');
    container.appendChild(iframe);

    var html = message_data.html || message_data.text;
    window.document.getElementById('messages').appendChild(container);

    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional //EN" "http://www.w3.org/TR/html4/loose.dtd">'+
        '<html><head><link rel="stylesheet" href="css/message.css"><\/head><body>'+
        messageView.formatHTML(html)+
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

module.exports = messageView;
