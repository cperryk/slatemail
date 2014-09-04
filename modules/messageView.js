var $ = require('jquery');
var fs = require('fs');
var message_css = fs.readFileSync('css/message.css','utf8');
var MailComposer = require('../mailComposer/mailComposer.js');


function MessageView(container, messages, box_name){
  this.container = container
    .empty()
    .addClass('message_view');
  this.top_wrapper = $('<div>')
    .addClass('top')
    .appendTo(container);
  this.messages_wrapper = $('<div>')
    .addClass('messages')
    .appendTo(container);
  this.messages = messages;
  this.box_name = box_name;
  this.printTop(messages)
    .printMessages(messages, box_name)
    .addEventListeners();
}

MessageView.prototype = {
  clear:function(){
    this.container
      .removeClass('with_top');
    this.messages_wrapper.empty();
    this.top_wrapper
      .hide();
    return this;
  },
  printMessages: function(mail_objs, box_name){
    var self = this;
    mail_objs.forEach(function(mail_obj, index){
      var message = new Message(mail_obj, box_name, self);
      // if(index===0){
      //   message.select();
      // }
    });
    return this;
  },
  printTop: function(mail_objs){
    var subject = mail_objs[0].subject;
    var message_count = mail_objs.length;
    var attachments_count = (function(){
      var c = 0;
      mail_objs.forEach(function(mail_obj){
        if(mail_obj.attachments){
          c += mail_obj.attachments.length;
        }
      });
      return c;
    }());
    $('<div>')
      .addClass('thread_subject')
      .html(subject)
      .appendTo(this.top_wrapper);
    var wrapper = $('<div>')
      .addClass('message_count')
      .html(message_count+' Message'+(message_count>1?'s':'')+', '+
        attachments_count+' Attachment'+(attachments_count>1?'s':''))
      .appendTo(this.top_wrapper);
    // var wrapper = $('<div>')
    //   .appendTo(this.top_wrapper);
    this.btn_reply = $('<span>')
      .addClass('btn_reply')
      .html('reply all')
      .appendTo(wrapper);
    // this.btn_forward = $('<span>')
    //   .addClass('btn_forward')
    //   .html('forward')
    //   .appendTo(wrapper);
    this.top_wrapper
      .show();
    this.container.addClass('with_top');
    return this;
  },
  addEventListeners:function(){
    var self = this;
    this.btn_reply.click(function(){
      self.reply();
    });
    this.btn_forward.click(function(){
      self.forward();
    });
    console.log($(window));
    $(window).keypress(function(e){
      console.log(e);
      console.log(e.keyCode);
      console.log(e.metaKey);
      if(e.keyCode === 114 && e.metaKey){
        self.reply();
      }
    });
    return this;  
  },
  reply:function(){
    var latest_message = this.messages[0];
    console.log(latest_message);
    var conf = {};
    conf.to = latest_message.from[0].address;
    conf.subject = latest_message.subject;
    if(latest_message.cc){
      conf.cc = latest_message.cc;
    }
    new MailComposer(conf);
    console.log(latest_message);
  },
  forward:function(){
    console.log('forwarding');
  },
};

function Message(message_data, box_name, par){
  var self = this;
  this.message_data = message_data;
  this.par = par;
  var container = $('<div>')
      .addClass('envelope')
      .appendTo(par.messages_wrapper);

  var headers = $('<div>')
    .addClass('headers')
    .appendTo(container);

  $('<p>')
    .addClass('from')
    .html(this.getFromString(message_data))
    .appendTo(headers);

  $('<p>')
    .addClass('to')
    .html('To: '+this.getToString(message_data) + 
      (message_data.cc?' | cc: ' + this.getToString(message_data,true):''))
    .appendTo(headers);

  $('<div>')
    .addClass('date')
    .html(this.parseDate(message_data.date))
    .appendTo(container);

  this.headers = headers;



  var iframe_wrapper = $('<div>')
    .addClass('iframe_wrapper')
    .appendTo(container);

  var iframe = $('<iframe>')
    .attr('frameborder',0)
    .attr('scrolling','no')
    .css('height','100%')
    .appendTo(iframe_wrapper)
    .contents()
      .find('head')
        .html('<style>'+message_css+'</style>')
        .end();

  var injected_wrapper = $('<div>')
    .appendTo(iframe.contents().find('body'));

  injected_wrapper
    .html(this.prepHTML(message_data, box_name));
  
  var height = injected_wrapper.outerHeight();
  iframe_wrapper.css('height',height);
  this.container = container;

  this.addEventListeners();
}
Message.prototype = {
  getToString: function(message_data, cc){
    var self = this;
    var to = message_data.to;
    if(cc){
      to = message_data.cc;
    }
    var arr = [];
    for(var i=0;i<to.length;i++){
      var rec = to[i];
      if(rec.name){
        arr.push(this.parseName(rec.name));
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
  parseDate:function(date){
    var d = new Date(date);
    return d.toDateString();
  },
  prepHTML: function(message_data, box_name){
    var html = message_data.html || message_data.text.replace(/(?:\r\n|\r|\n)/g, '<br />');
    var stage = $('<div>')
      .hide()
      .html(html)
      .find('.gmail_quote,#OLK_SRC_BODY_SECTION,.gmail_extra,#signature,blockquote,#message-coda')
        .remove()
        .end();
    stage
      .find('hr')
        .nextAll()
          .remove()
          .end()
        .remove()
        .end()
      .find('img')
        .each(function(){
          // parse inline images
          if(!message_data.attachments){
            return;
          }
          var src = $(this).attr('src');
          if(src.indexOf('cid:')!==0){
            return;
          }
          var content_id = src.replace('cid:','');
          var attachments = message_data.attachments;
          for(var i=0; i<attachments.length; i++){
            var attachment = attachments[i];
            if(attachment.contentId === content_id){
              var file_name = attachment.fileName;
              var file_path = ['attachments',box_name,message_data.uid,file_name].join('/');
              $(this).attr('src',file_path);
              break;
            }
          }
        });
    return stage.html();
  },
  select:function(){
    if(this.par.selected_message){
      this.par.selected_message.deselect();
    }
    this.container.addClass('selected');
    this.par.selected_message = this;
  },
  deselect:function(){
    if(this.par.selected_message){
      delete this.par.selected_message;
    }
    this.container.removeClass('selected');
  },
  printActionBtns:function(){
    var self = this;
    var btns = $('<p>')
      .addClass('action_btns')
      .hide()
      .appendTo(this.headers)
      .fadeIn(100);

    var inner_wrapper = $('<span>')
      .addClass('inner_wrapper')
      .appendTo(btns);

    $('<span>')
      .addClass('action_btn btn_reply')
      .html('Reply')
      .appendTo(inner_wrapper)
      .click(function(){
        self.reply();
      });

    $('<span>')
      .addClass('action_btn btn_reply_all')
      .html('Reply All')
      .appendTo(inner_wrapper)
      .click(function(){
        self.replyAll();
      });

    $('<span>')
      .addClass('action_btn btn_forward')
      .html('Forward')
      .appendTo(inner_wrapper)
      .click(function(){
        self.forward();
      });

    $('<span>')
      .addClass('action_btn btn_tag')
      .html('Tag')
      .appendTo(inner_wrapper)
      .click(function(){
        self.tag();
      });

    this.action_btns = btns;
  },
  removeActionBtns:function(){
    if(this.action_btns){
      this.action_btns.remove();
    }
  },
  addEventListeners:function(){
    var self = this;
    this.container.hover(function(){
      self.printActionBtns();
    }, function(){
      self.removeActionBtns();
    });
  },
  reply:function(){
    new MailComposer({
      to:this.message_data.from,
      subject:this.message_data.subject
    });
  },
  replyAll:function(){
    var conf = {};
    conf.subject = this.message_data.subject;
    conf.to = this.message_data.from;
    if(this.message_data.cc){
      conf.cc = this.message_data.cc;
    }
    new MailComposer(conf);
  },
  forward:function(){

  },
  tag:function(){
    var tag = window.prompt('tag');
  }
};

module.exports = MessageView;
