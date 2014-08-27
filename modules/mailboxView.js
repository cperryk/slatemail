var $ = require('jquery');
var favicon = require('favicon');
var favicon_urls = {};
var onSelectEmail;

mailboxView = {
  addEventListeners:function(){
    var self = this;
    $(function(){
      $('#inbox').on('click','.inbox_email',function(){
        mailboxView.select($(this));
      });
    });
  },
  printMessage:function(mail_object){
    var message_wrapper = $('<div>')
      .data('uid',mail_object.uid)
      .addClass('inbox_email');
    if(mail_object.flags.indexOf('\\Seen')===-1){
      message_wrapper.addClass('unseen');
    }
    $('<div>')
      .addClass('from')
      .html(mailboxView.parseName(mail_object.headers.from))
      .appendTo(message_wrapper);
    $('<div>')
      .addClass('subject')
      .html(mail_object.headers.subject)
      .appendTo(message_wrapper);
    $('<div>')
      .addClass('text_preview')
      .html(mailboxView.getPreviewText(mail_object))
      .appendTo(message_wrapper);
    mailboxView.insertFavicon(message_wrapper, mail_object);
    mailboxView.lasted_printed_date = mail_object.date;
    message_wrapper.appendTo('#inbox');
  },
  insertFavicon:function(message_wrapper, mail_object){
    var url = getFaviconUrl(mail_object, function(url){
      if(!url){
        return;
      }
      var img = $('<img>')
        .attr('src', url)
        .addClass('icon')
        .prependTo(message_wrapper);
    });
    function getFaviconUrl(mail_object, callback){
      if(!mail_object.from){
        callback(false);
        return;
      }
      var from = mail_object.from[0].address;
      var domain = from.replace(/.*@/, "");
      if(favicon_urls[domain]){
        callback(favicon_urls[domain]);
      }
      else{
        favicon("http://"+domain, function(err, favicon_url) {
          callback(favicon_url);
        });
      }
    }
  },
  select:function(inbox_email){
    var self = this;
    if(mailboxView.selected_email){
      mailboxView.selected_email.removeClass('selected');
    }
    inbox_email.addClass('selected');
    if(onSelectEmail){
      onSelectEmail(inbox_email.data('uid'));
    }
    mailboxView.selected_email = inbox_email;
  },
  getPreviewText:function(mail_object){
    /**
     * Return the preview text of a mail object. The preview text is a slice of
     * the email's message text.
     * @param {object} mail_object
     */
    if(mail_object.text){
      return mail_object.text.replace(/[\n\r]/g, '').slice(0,100);
    }
    if(mail_object.html){
      return mail_object.html.replace(/[\n\r]/g, '').slice(0,100);
    }
    return false;
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
  onSelect:function(fnc){
    console.log('go');
    onSelectEmail = fnc;
  }
};

mailboxView.addEventListeners();

module.exports = mailboxView;
