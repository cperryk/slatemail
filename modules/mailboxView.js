var $ = require('jquery');
var favicon = require('favicon');
var favicon_urls = {};
var onSelectEmail;
var last_printed_date;

mailboxView = {
  clear:function(){
    $('#inbox').empty();
  },
  addEventListeners:function(){
    var self = this;
    $(function(){
      $('#inbox').on('click','.inbox_email',function(){
        mailboxView.select($(this));
        $(this).removeClass('unseen');
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
      .html(mailboxView.parseName(mail_object.from))
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
    mailboxView.insertDateSeparator(mail_object);
    message_wrapper.appendTo('#inbox');
  },
  insertDateSeparator:function(mail_object){
    var date_string = mailboxView.getDateString(mail_object.date);
    if(date_string && date_string!==last_printed_date){
      mailboxView.printDateSeparator(date_string);
      last_printed_date = date_string;
    }
  },
  getDateString:function(date){
    var today = new Date();
    var days_diff = Math.abs(Math.round(daysDiff(today, date)));
    var days_of_week = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    if(days_diff===0){
      return 'today';
    }
    if(days_diff===1){
      return 'yestersday';
    }
    if(days_diff>=2 && days_diff < 7){
      return days_of_week[date.getDay()];
    }
    if(days_diff >= 7 && days_diff < 14){
      return 'One week ago';
    }
    if(days_diff >= 14){
      return 'Two weeks ago';
    }
    if(days_diff >= 30){
      return 'One month ago';
    }
    if(days_diff >= 60){
      return 'Two months ago';
    }
    if(days_diff >= 90){
      return 'Three months ago';
    }
    if(days_diff >= 360){
      return 'One year ago';
    }
    return false;

    function daysDiff(first, second) {
      return (second-first)/(1000*60*60*24);
    }


    return false;
  },
  printDateSeparator:function(s){
    $('<div>')
      .addClass('date_separator')
      .html(s)
      .appendTo('#inbox')
      .click(function(){
        if($(this).hasClass('collapsed')){
          $(this).nextUntil('.date_separator')
            .show();
          $(this).removeClass('collapsed');
        }
        else{
          $(this).nextUntil('.date_separator')
            .hide();
          $(this).addClass('collapsed');
        }
      });
  },
  insertFavicon:function(message_wrapper, mail_object){
    var url = getFaviconUrl(mail_object, function(url){
      if(!url){
        return;
      }
      var img = $('<img>')
        .attr('src', url)
        .addClass('icon')
        .load(function(){
          $(this).prependTo(message_wrapper);
        });

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
    console.log(onSelectEmail);
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
      return mail_object.text.replace(/[\n\r]/g, ' ').slice(0,125);
    }
    if(mail_object.html){
      return mail_object.html.replace(/[\n\r]/g, ' ').slice(0,125);
    }
    return false;
  },
  parseName:function(from_header){
    if(!from_header || from_header.length === 0){
      return '';
    }
    if(from_header[0].name){
      s = from_header[0].name;
      s = s.replace(/"/g,"");
      s = s.split(',');
      if(s.length>1){
        s.reverse();
        return s.join(' ');
      }
      else{
        return s;
      }
    }
    else{
      return from_header[0].address;
    }
    return '';
  },
  onSelect:function(fnc){
    onSelectEmail = fnc;
  }
};
mailboxView.addEventListeners();

module.exports = mailboxView;
